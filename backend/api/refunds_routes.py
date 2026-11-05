from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field

from api.deps import require_staff_writer
from api.refunds import refund_refusal
from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)
refunds_router = APIRouter()

_BRANCHES = ("Nereo Rdz.", "Sucursal móvil", "Centro")
_MISSING = "Falta la tabla de reembolsos. Aplica la migración 000016 en Supabase."
_SELECT = "id, folio, branch, amount_cents, original_payment, recharged_at, created_at"


def _branch_or_422(branch: str) -> str:
    if branch not in _BRANCHES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Sucursal inválida")
    return branch


def _missing_table(exc: APIError) -> bool:
    return exc.code in ("42P01", "PGRST205")


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


class RefundCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    folio: int = Field(ge=1)
    branch: str = Field(min_length=1, max_length=40)


class RefundOut(BaseModel):
    id: str
    folio: int
    branch: str
    customerName: str
    amountCents: int
    originalPayment: str
    recharged: bool
    createdAt: str


def _out(row: dict, name: str) -> RefundOut:
    return RefundOut(
        id=str(row["id"]),
        folio=int(row["folio"]),
        branch=row["branch"],
        customerName=name,
        amountCents=int(row["amount_cents"]),
        originalPayment=row["original_payment"],
        recharged=row.get("recharged_at") is not None,
        createdAt=_iso(row["created_at"]),
    )


def _names(folios: list[int]) -> dict[int, str]:
    if not folios:
        return {}
    orders = get_supabase().table("orders").select("folio, customer_id").in_("folio", folios).execute()
    rows = orders.data or []
    customer_ids = sorted({str(row["customer_id"]) for row in rows})
    names: dict[str, str] = {}
    if customer_ids:
        people = get_supabase().table("customers").select("id, name").in_("id", customer_ids).execute()
        names = {str(row["id"]): str(row["name"]) for row in people.data or []}
    return {int(row["folio"]): names.get(str(row["customer_id"]), "—") for row in rows}


def _has_note(folio: int, notes: str | None) -> bool:
    if str(notes or "").strip():
        return True
    for table in ("order_notes", "order_photos"):
        res = get_supabase().table(table).select("id").eq("order_folio", folio).limit(1).execute()
        if res.data:
            return True
    return False


def _load_order(folio: int) -> dict | None:
    columns = "folio, payment_method, branch, total_cents, notes, wants_invoice, invoice_pdf_key, invoice_xml_key"
    try:
        res = get_supabase().table("orders").select(columns).eq("folio", folio).limit(1).execute()
    except APIError as exc:
        if exc.code != "42703":
            raise
        res = (
            get_supabase()
            .table("orders")
            .select("folio, payment_method, branch, total_cents, notes, wants_invoice")
            .eq("folio", folio)
            .limit(1)
            .execute()
        )
    rows = res.data or []
    return rows[0] if rows else None


def _insert_refund(folio: int, branch: str, amount: int, payment: str, staff_user_id: str) -> dict:
    res = (
        get_supabase()
        .table("refunds")
        .insert(
            {
                "folio": folio,
                "branch": branch,
                "amount_cents": amount,
                "original_payment": payment,
                "staff_user_id": staff_user_id,
            }
        )
        .execute()
    )
    return (res.data or [None])[0]


def _clear_invoice(folio: int) -> None:
    get_supabase().table("orders").update({"wants_invoice": False}).eq("folio", folio).execute()


def _deliver(folio: int) -> None:
    get_supabase().table("orders").update(
        {"status": "entregado", "status_updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("folio", folio).neq("status", "entregado").execute()


def _create(body: RefundCreate, staff_user_id: str) -> RefundOut:
    branch = _branch_or_422(body.branch)
    order = _load_order(body.folio)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    has_files = bool(order.get("invoice_pdf_key") or order.get("invoice_xml_key"))
    reason = refund_refusal(
        order["payment_method"],
        order.get("branch"),
        branch,
        int(order["total_cents"]),
        has_files,
        _has_note(body.folio, order.get("notes")),
    )
    if reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=reason)
    try:
        row = _insert_refund(body.folio, branch, int(order["total_cents"]), order["payment_method"], staff_user_id)
    except APIError as exc:
        if exc.code == "23505":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Esta orden ya fue reembolsada.") from None
        raise
    if not row:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el reembolso")
    if order["payment_method"] == "efectivo" and order.get("wants_invoice"):
        _clear_invoice(body.folio)
    _deliver(body.folio)
    names = _names([body.folio])
    return _out(row, names.get(body.folio, "—"))


@refunds_router.post("", response_model=RefundOut)
async def create_refund(body: RefundCreate, staff: dict = Depends(require_staff_writer)):
    try:
        return await asyncio.to_thread(_create, body, staff["user_id"])
    except HTTPException:
        raise
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("create_refund falló folio=%s", body.folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el reembolso") from None
    except Exception:
        logger.exception("create_refund falló folio=%s", body.folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el reembolso") from None
