from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import require_pos_staff, require_staff_writer
from api.supabase_client import get_supabase
from api.validation import sanitize_text

logger = logging.getLogger(__name__)
expenses_router = APIRouter()

Branch = Literal["Nereo Rdz.", "Sucursal móvil", "Centro"]
Payment = Literal["efectivo", "tarjeta", "transferencia"]
# ponytail: tope $9,999,999 y fechas 2020–2100. Sube el check si un gasto real no cabe.
_AMOUNT_MAX_CENTS = 9_999_999 * 100
_CONCEPT_MAX = 200
_SELECT = "id, branch, spent_on, amount_cents, concept, payment_method"
_BRANCHES = ("Nereo Rdz.", "Sucursal móvil", "Centro")
_MISSING = "Falta la tabla de gastos. Aplica la migración 000015 en Supabase."


def month_range(year: int, month: int) -> tuple[str, str]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start.isoformat(), end.isoformat()


def totals_by_month(rows: list[tuple[str, int]]) -> list[int]:
    totals = [0] * 12
    for spent_on, cents in rows:
        totals[int(spent_on[5:7]) - 1] += cents
    return totals


def _branch_or_422(branch: str) -> str:
    if branch not in _BRANCHES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Sucursal inválida")
    return branch


def _missing_table(exc: APIError) -> bool:
    return exc.code in ("42P01", "PGRST205")


class ExpenseOut(BaseModel):
    id: str
    branch: Branch
    spentOn: str
    amountCents: int
    concept: str
    paymentMethod: Payment


class ExpenseWrite(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    spent_on: date = Field(alias="spentOn")
    amount_cents: int = Field(alias="amountCents", ge=100, le=_AMOUNT_MAX_CENTS, strict=True)
    concept: str = Field(min_length=1, max_length=_CONCEPT_MAX)
    payment_method: Payment = Field(alias="paymentMethod")

    @field_validator("spent_on")
    @classmethod
    def spent_on_bounds(cls, v: date) -> date:
        if v < date(2020, 1, 1) or v > date(2100, 12, 31):
            raise ValueError("La fecha debe estar entre 2020 y 2100.")
        return v

    @field_validator("amount_cents")
    @classmethod
    def whole_pesos(cls, v: int) -> int:
        if v % 100 != 0:
            raise ValueError("El monto debe ser en pesos enteros, sin centavos.")
        return v

    @field_validator("concept")
    @classmethod
    def clean_concept(cls, v: str) -> str:
        v = " ".join(sanitize_text(v, _CONCEPT_MAX).split())
        if not v:
            raise ValueError("El concepto es obligatorio")
        return v


class ExpenseCreate(ExpenseWrite):
    branch: Branch


def _row_to_out(row: dict) -> ExpenseOut:
    spent = row["spent_on"]
    spent_s = spent.isoformat() if hasattr(spent, "isoformat") else str(spent)
    return ExpenseOut(
        id=str(row["id"]),
        branch=row["branch"],
        spentOn=spent_s[:10],
        amountCents=int(row["amount_cents"]),
        concept=row["concept"],
        paymentMethod=row["payment_method"],
    )


def _list_expenses(branch: str, year: int, month: int):
    start, end = month_range(year, month)
    return (
        get_supabase()
        .table("expenses")
        .select(_SELECT)
        .eq("branch", branch)
        .gte("spent_on", start)
        .lt("spent_on", end)
        .order("spent_on", desc=True)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )


def _insert_expense(body: ExpenseCreate, staff_user_id: str):
    return (
        get_supabase()
        .table("expenses")
        .insert(
            {
                "branch": body.branch,
                "spent_on": body.spent_on.isoformat(),
                "amount_cents": body.amount_cents,
                "concept": body.concept,
                "payment_method": body.payment_method,
                "staff_user_id": staff_user_id,
            }
        )
        .execute()
    )


def _update_expense(expense_id: str, body: ExpenseWrite, staff_user_id: str):
    return (
        get_supabase()
        .table("expenses")
        .update(
            {
                "spent_on": body.spent_on.isoformat(),
                "amount_cents": body.amount_cents,
                "concept": body.concept,
                "payment_method": body.payment_method,
                "staff_user_id": staff_user_id,
            }
        )
        .eq("id", expense_id)
        .execute()
    )


def _delete_expense(expense_id: str):
    return get_supabase().table("expenses").delete().eq("id", expense_id).execute()


def _year_amounts(branch: str, year: int):
    # ponytail: tope 2000 filas por año; agrupar en SQL si una sucursal lo pasa.
    return (
        get_supabase()
        .table("expenses")
        .select("spent_on, amount_cents")
        .eq("branch", branch)
        .gte("spent_on", f"{year}-01-01")
        .lt("spent_on", f"{year + 1}-01-01")
        .limit(2000)
        .execute()
    )


@expenses_router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    year: int = Query(ge=2020, le=2100),
    month: int = Query(ge=1, le=12),
    branch: str = Query(min_length=1, max_length=40),
    _staff: dict = Depends(require_pos_staff),
):
    branch_name = _branch_or_422(branch)
    try:
        res = await asyncio.to_thread(_list_expenses, branch_name, year, month)
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("list_expenses falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer los gastos") from None
    except Exception:
        logger.exception("list_expenses falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer los gastos") from None
    return [_row_to_out(row) for row in res.data or []]


@expenses_router.get("/months", response_model=list[int])
async def expense_months(
    year: int = Query(ge=2020, le=2100),
    branch: str = Query(min_length=1, max_length=40),
    _staff: dict = Depends(require_pos_staff),
):
    branch_name = _branch_or_422(branch)
    try:
        res = await asyncio.to_thread(_year_amounts, branch_name, year)
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("expense_months falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer los gastos") from None
    except Exception:
        logger.exception("expense_months falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer los gastos") from None
    pairs = [(_as_date(row["spent_on"]), int(row["amount_cents"])) for row in res.data or []]
    return totals_by_month(pairs)


def _as_date(value: object) -> str:
    return value.isoformat()[:10] if hasattr(value, "isoformat") else str(value)[:10]


@expenses_router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(body: ExpenseCreate, staff: dict = Depends(require_staff_writer)):
    try:
        res = await asyncio.to_thread(_insert_expense, body, staff["user_id"])
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("create_expense falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el gasto") from None
    except Exception:
        logger.exception("create_expense falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el gasto") from None
    if not res.data:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el gasto")
    logger.info("audit expense.create user_id=%s expense_id=%s", staff["user_id"], res.data[0]["id"])
    return _row_to_out(res.data[0])


@expenses_router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: UUID, body: ExpenseWrite, staff: dict = Depends(require_staff_writer)):
    try:
        res = await asyncio.to_thread(_update_expense, str(expense_id), body, staff["user_id"])
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("update_expense falló expense_id=%s", expense_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el gasto") from None
    except Exception:
        logger.exception("update_expense falló expense_id=%s", expense_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el gasto") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    logger.info("audit expense.update user_id=%s expense_id=%s", staff["user_id"], expense_id)
    return _row_to_out(res.data[0])


@expenses_router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: UUID, staff: dict = Depends(require_staff_writer)):
    try:
        res = await asyncio.to_thread(_delete_expense, str(expense_id))
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING) from None
        logger.exception("delete_expense falló expense_id=%s", expense_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo borrar el gasto") from None
    except Exception:
        logger.exception("delete_expense falló expense_id=%s", expense_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo borrar el gasto") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    logger.info("audit expense.delete user_id=%s expense_id=%s", staff["user_id"], expense_id)
