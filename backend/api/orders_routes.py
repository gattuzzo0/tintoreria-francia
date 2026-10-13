from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import require_pos_staff, require_staff_writer
from api.supabase_client import RpcError, call_rpc, get_supabase
from api.validation import NOTES_MAX, sanitize_text

logger = logging.getLogger(__name__)
orders_router = APIRouter()

PaymentMethod = Literal["efectivo", "tarjeta", "transferencia", "pendiente"]
OrderStatus = Literal["recibido", "proceso", "listo", "entregado"]
NEXT_STATUS: dict[str, str] = {"recibido": "proceso", "proceso": "listo", "listo": "entregado"}
MAX_LINES = 50
ORDERS_LIMIT = 500
_SELECT = (
    "folio, customer_id, express, delivery_date, payment_method, status, notes, created_at, "
    "base_cents, surcharge_cents, subtotal_cents, tax_cents, total_cents, "
    "order_lines(service_id, name, unit, unit_price_cents, qty), "
    "order_notes(id, body, created_at)"
)


class OrderLineIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    service_id: str = Field(alias="serviceId", min_length=1, max_length=20)
    qty: int = Field(ge=1, le=999)


class OrderCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    customer_id: str = Field(alias="customerId", min_length=1, max_length=64)
    express: bool = False
    # El rango (mañana … +15 días, hora CDMX) lo valida la RPC create_order.
    delivery_date: date = Field(alias="deliveryDate")
    payment: PaymentMethod
    notes: str = Field(default="", max_length=2000)
    lines: list[OrderLineIn] = Field(min_length=1, max_length=MAX_LINES)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, v: str) -> str:
        return sanitize_text(v, NOTES_MAX).strip()

    @field_validator("lines")
    @classmethod
    def unique_services(cls, v: list[OrderLineIn]) -> list[OrderLineIn]:
        if len({line.service_id for line in v}) != len(v):
            raise ValueError("Cada servicio debe aparecer una sola vez")
        return v


class StatusUpdate(BaseModel):
    status: OrderStatus


class NoteCreate(BaseModel):
    body: str = Field(max_length=2000)

    @field_validator("body")
    @classmethod
    def clean_body(cls, v: str) -> str:
        v = sanitize_text(v, NOTES_MAX).strip()
        if not v:
            raise ValueError("La nota no puede estar vacía")
        return v


class OrderNoteOut(BaseModel):
    id: int
    body: str
    createdAt: str


class OrderLineOut(BaseModel):
    serviceId: str
    name: str
    unit: str
    unitPriceCents: int
    qty: int


class OrderOut(BaseModel):
    folio: int
    customerId: str
    lines: list[OrderLineOut]
    express: bool
    deliveryDate: str
    payment: PaymentMethod
    status: OrderStatus
    notes: str
    staffNotes: list[OrderNoteOut]
    createdAt: str
    baseCents: int
    surchargeCents: int
    subtotalCents: int
    taxCents: int
    totalCents: int


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _row_to_order_out(row: dict) -> OrderOut:
    created = row["created_at"]
    return OrderOut(
        folio=int(row["folio"]),
        customerId=str(row["customer_id"]),
        lines=[
            OrderLineOut(
                serviceId=str(line["service_id"]),
                name=line["name"],
                unit=line["unit"],
                unitPriceCents=int(line["unit_price_cents"]),
                qty=int(line["qty"]),
            )
            for line in row.get("order_lines") or []
        ],
        express=bool(row["express"]),
        deliveryDate=str(row["delivery_date"]),
        payment=row["payment_method"],
        status=row["status"],
        notes=row.get("notes") or "",
        staffNotes=[
            OrderNoteOut(id=int(n["id"]), body=n["body"], createdAt=_iso(n["created_at"]))
            for n in sorted(row.get("order_notes") or [], key=lambda n: int(n["id"]))
        ],
        createdAt=created.isoformat() if hasattr(created, "isoformat") else str(created),
        baseCents=int(row["base_cents"]),
        surchargeCents=int(row["surcharge_cents"]),
        subtotalCents=int(row["subtotal_cents"]),
        taxCents=int(row["tax_cents"]),
        totalCents=int(row["total_cents"]),
    )


def _fetch_orders():
    return get_supabase().table("orders").select(_SELECT).order("folio", desc=True).limit(ORDERS_LIMIT).execute()


def _fetch_order(folio: int):
    return get_supabase().table("orders").select(_SELECT).eq("folio", folio).limit(1).execute()


def _update_status(folio: int, current: str, new: str):
    return (
        get_supabase()
        .table("orders")
        .update({"status": new, "status_updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("folio", folio)
        .eq("status", current)
        .execute()
    )


def _insert_note(folio: int, body: str, staff_user_id: str):
    return (
        get_supabase()
        .table("order_notes")
        .insert({"order_folio": folio, "body": body, "staff_user_id": staff_user_id})
        .execute()
    )


async def _get_order_or_404(folio: int) -> dict:
    try:
        res = await asyncio.to_thread(_fetch_order, folio)
    except Exception:
        logger.exception("Lectura de orden falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la orden") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return res.data[0]


@orders_router.get("", response_model=list[OrderOut])
async def list_orders(_staff: dict = Depends(require_pos_staff)):
    try:
        res = await asyncio.to_thread(_fetch_orders)
    except Exception:
        logger.exception("list_orders falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer las órdenes") from None
    return [_row_to_order_out(r) for r in res.data or []]


@orders_router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    staff: dict = Depends(require_staff_writer),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=100),
):
    payload = {
        "p_staff_user_id": staff["user_id"],
        "p_customer_id": body.customer_id,
        "p_express": body.express,
        "p_payment_method": body.payment,
        "p_notes": body.notes,
        "p_lines": [{"serviceId": line.service_id, "qty": line.qty} for line in body.lines],
        "p_delivery_date": body.delivery_date.isoformat(),
        "p_idempotency_key": idempotency_key,
    }
    try:
        folio = await asyncio.to_thread(call_rpc, "create_order", payload)
    except RpcError as e:
        if e.code in ("22023", "22P02"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=e.message) from None
        logger.exception("create_order RPC falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo registrar la orden") from None
    except Exception:
        logger.exception("create_order RPC falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo registrar la orden") from None

    logger.info("audit order.create user_id=%s folio=%s", staff["user_id"], folio)
    return _row_to_order_out(await _get_order_or_404(int(folio)))


@orders_router.patch("/{folio}/status", response_model=OrderOut)
async def advance_order(folio: int, body: StatusUpdate, staff: dict = Depends(require_staff_writer)):
    row = await _get_order_or_404(folio)
    current = row["status"]
    if NEXT_STATUS.get(current) != body.status:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"No se puede pasar de '{current}' a '{body.status}'",
        )
    try:
        res = await asyncio.to_thread(_update_status, folio, current, body.status)
    except Exception:
        logger.exception("advance_order falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo actualizar la orden") from None
    if not res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="La orden cambió de estado; recarga e intenta de nuevo")

    logger.info("audit order.status user_id=%s folio=%s %s->%s", staff["user_id"], folio, current, body.status)
    return _row_to_order_out(await _get_order_or_404(folio))


@orders_router.post("/{folio}/notes", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def add_order_note(folio: int, body: NoteCreate, staff: dict = Depends(require_staff_writer)):
    await _get_order_or_404(folio)
    try:
        await asyncio.to_thread(_insert_note, folio, body.body, staff["user_id"])
    except Exception:
        logger.exception("add_order_note falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar la nota") from None

    logger.info("audit order.note user_id=%s folio=%s", staff["user_id"], folio)
    return _row_to_order_out(await _get_order_or_404(folio))
