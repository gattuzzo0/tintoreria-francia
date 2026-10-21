from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import require_pos_staff, require_staff_writer
from api.order_photo_routes import attach_order_photo, order_photo_router, prepare_order_photo
from api.supabase_client import RpcError, call_rpc, get_supabase
from api.validation import NOTES_MAX, sanitize_text

logger = logging.getLogger(__name__)
orders_router = APIRouter()
orders_router.include_router(order_photo_router)

PaymentMethod = Literal["efectivo", "tarjeta", "transferencia", "pendiente"]
OrderStatus = Literal["recibido", "proceso", "listo", "entregado"]
NEXT_STATUS: dict[str, str] = {"recibido": "proceso", "proceso": "listo", "listo": "entregado"}
MAX_LINES = 50
ORDERS_LIMIT = 500
GARMENT_COLORS = frozenset(
    {"rojo", "amarillo", "verde", "azul", "azul_claro", "morado", "rosa", "naranja", "cafe", "negro", "blanco"}
)
Branch = Literal["Nereo Rdz.", "Sucursal móvil", "Centro"]

_SELECT_PLAIN = (
    "folio, customer_id, express, delivery_date, payment_method, status, notes, branch, created_at, "
    "base_cents, surcharge_cents, subtotal_cents, tax_cents, total_cents, "
    "order_lines(service_id, name, unit, unit_price_cents, qty, color), "
    "order_notes(id, body, created_at)"
)
_SELECT = _SELECT_PLAIN + ", order_photos(id, created_at)"


class OrderLineIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    service_id: str = Field(alias="serviceId", min_length=1, max_length=20)
    qty: int = Field(ge=1, le=999)
    color: str = Field(min_length=1, max_length=20)

    @field_validator("color")
    @classmethod
    def color_ok(cls, v: str) -> str:
        if v not in GARMENT_COLORS:
            raise ValueError("Color inválido")
        return v


class OrderCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    customer_id: str = Field(alias="customerId", min_length=1, max_length=64)
    express: bool = False
    # Rango (CDMX) lo valida create_order. Domingo se recorre al lunes.
    delivery_date: date = Field(alias="deliveryDate")
    payment: PaymentMethod
    branch: Branch
    notes: str = Field(default="", max_length=2000)
    photo_id: str | None = Field(default=None, alias="photoId")
    lines: list[OrderLineIn] = Field(min_length=1, max_length=MAX_LINES)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, v: str) -> str:
        return sanitize_text(v, NOTES_MAX).strip()

    @field_validator("photo_id")
    @classmethod
    def photo_ok(cls, v: str | None) -> str | None:
        if not v:
            return None
        try:
            return str(uuid.UUID(v))
        except ValueError:
            raise ValueError("Foto inválida") from None

    @field_validator("lines")
    @classmethod
    def unique_services(cls, v: list[OrderLineIn]) -> list[OrderLineIn]:
        if len({(line.service_id, line.color) for line in v}) != len(v):
            raise ValueError("Cada servicio y color debe aparecer una sola vez")
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


class AttachPhoto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    photo_id: str = Field(alias="photoId")

    @field_validator("photo_id")
    @classmethod
    def photo_ok(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError:
            raise ValueError("Foto inválida") from None


class OrderLineOut(BaseModel):
    serviceId: str
    name: str
    unit: str
    unitPriceCents: int
    qty: int
    color: str = ""


class OrderOut(BaseModel):
    folio: int
    customerId: str
    lines: list[OrderLineOut]
    express: bool
    deliveryDate: str
    payment: PaymentMethod
    branch: Branch | None
    status: OrderStatus
    notes: str
    photoId: str | None = None
    photoIds: list[str] = []
    staffNotes: list[OrderNoteOut]
    createdAt: str
    baseCents: int
    surchargeCents: int
    subtotalCents: int
    taxCents: int
    totalCents: int


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _photo_ids(row: dict) -> list[str]:
    photos = sorted(
        row.get("order_photos") or [],
        key=lambda photo: (str(photo.get("created_at") or ""), str(photo.get("id") or "")),
    )
    return [str(photo["id"]) for photo in photos if photo.get("id")]


def _row_to_order_out(row: dict) -> OrderOut:
    created = row["created_at"]
    photo_ids = _photo_ids(row)
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
                color=str(line.get("color") or ""),
            )
            for line in row.get("order_lines") or []
        ],
        express=bool(row["express"]),
        deliveryDate=str(row["delivery_date"]),
        payment=row["payment_method"],
        branch=row.get("branch"),
        status=row["status"],
        notes=row.get("notes") or "",
        photoId=photo_ids[0] if photo_ids else None,
        photoIds=photo_ids,
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


def _query_orders(columns: str, folio: int | None):
    query = get_supabase().table("orders").select(columns)
    if folio is None:
        return query.order("folio", desc=True).limit(ORDERS_LIMIT).execute()
    return query.eq("folio", folio).limit(1).execute()


def _fetch_orders():
    try:
        return _query_orders(_SELECT, None)
    except Exception:
        logger.warning("order_photos no disponible; aplica backend/migrations/000007_order_photos.sql")
        return _query_orders(_SELECT_PLAIN, None)


def _fetch_order(folio: int):
    try:
        return _query_orders(_SELECT, folio)
    except Exception:
        logger.warning("order_photos no disponible; aplica backend/migrations/000007_order_photos.sql")
        return _query_orders(_SELECT_PLAIN, folio)


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
        "p_lines": [{"serviceId": line.service_id, "qty": line.qty, "color": line.color} for line in body.lines],
        "p_delivery_date": body.delivery_date.isoformat(),
        "p_branch": body.branch,
        "p_idempotency_key": idempotency_key,
    }
    if body.photo_id:
        try:
            await asyncio.to_thread(prepare_order_photo, body.photo_id, staff["user_id"])
        except HTTPException:
            raise
        except Exception:
            logger.exception("prepare_order_photo falló user_id=%s", staff["user_id"])
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la foto") from None
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

    if body.photo_id:
        try:
            await asyncio.to_thread(attach_order_photo, body.photo_id, int(folio), staff["user_id"])
        except HTTPException:
            raise
        except Exception:
            logger.exception("attach_order_photo falló folio=%s", folio)
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="La orden se creó pero no se pudo ligar la foto") from None
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


@orders_router.post("/{folio}/photos", response_model=OrderOut)
async def add_order_photo(folio: int, body: AttachPhoto, staff: dict = Depends(require_staff_writer)):
    await _get_order_or_404(folio)
    try:
        await asyncio.to_thread(attach_order_photo, body.photo_id, folio, staff["user_id"])
    except HTTPException:
        raise
    except Exception:
        logger.exception("add_order_photo falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo agregar la foto") from None
    logger.info("audit order.photo.attach user_id=%s folio=%s photo_id=%s", staff["user_id"], folio, body.photo_id)
    return _row_to_order_out(await _get_order_or_404(folio))
