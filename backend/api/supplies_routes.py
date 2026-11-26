from __future__ import annotations

import asyncio
import logging
import re
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.deps import require_pos_staff, require_staff_writer
from api.supabase_client import get_supabase
from api.validation import sanitize_text

logger = logging.getLogger(__name__)
supplies_router = APIRouter()

Branch = Literal["Nereo Rdz.", "Sucursal móvil", "Centro"]
_ITEM_MAX = 80
_BRANCHES = ("Nereo Rdz.", "Sucursal móvil", "Centro")
_SELECT = "id, branch, item, opened_on"
# ponytail: tope 2000 filas por sucursal. Si una caja lo pasa, agregar en SQL.
_LIMIT = 2000
_ITEM_LIMIT = 500
_MISSING = "Falta la tabla de inventario. Aplica la migración 000026 en Supabase."
_MISSING_ITEMS = "Falta la tabla de artículos. Aplica la migración 000027 en Supabase."
_MISSING_QTY = "Falta la cantidad en artículos. Aplica la migración 000028 en Supabase."
SupplyUnit = Literal["litro", "kilogramo", "pza"]
_QTY_RE = re.compile(r"\d{1,6}(\.\d{1,3})?")
_QTY_MAX_MILLI = 999_999 * 1000


def quantity_milli(raw: str, unit: str) -> int:
    text = raw.strip().replace(",", ".")
    if not _QTY_RE.fullmatch(text):
        raise ValueError("La cantidad debe ser mayor a 0, con hasta 3 decimales.")
    whole, _, frac = text.partition(".")
    milli = int(whole) * 1000 + int((frac + "000")[:3])
    if milli < 1 or milli > _QTY_MAX_MILLI:
        raise ValueError("La cantidad debe ser mayor a 0 y menor a 1000000.")
    if unit == "pza" and milli % 1000:
        raise ValueError("Las piezas van en enteros.")
    return milli


def format_quantity(milli: int) -> str:
    whole, frac = divmod(int(milli), 1000)
    if frac == 0:
        return str(whole)
    return f"{whole}.{f'{frac:03d}'.rstrip('0')}"


def opening_stats(rows: list[tuple[str, str]]) -> list[dict]:
    """(item, opened_on) → promedio de días entre aperturas, agrupado sin distinguir mayúsculas."""
    groups: dict[str, list[tuple[str, str]]] = {}
    for item, opened in rows:
        groups.setdefault(" ".join(item.split()).casefold(), []).append((item, opened[:10]))
    out: list[dict] = []
    for entries in groups.values():
        entries.sort(key=lambda pair: pair[1])
        dates = [opened for _, opened in entries]
        gaps = [
            (date.fromisoformat(later) - date.fromisoformat(earlier)).days
            for earlier, later in zip(dates, dates[1:])
        ]
        out.append(
            {
                "item": entries[-1][0],
                "count": len(entries),
                "lastOpened": dates[-1],
                "avgDays": int(sum(gaps) / len(gaps) + 0.5) if gaps else None,
            }
        )
    out.sort(key=lambda stat: stat["lastOpened"], reverse=True)
    return out


def _branch_or_422(branch: str) -> str:
    if branch not in _BRANCHES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Sucursal inválida")
    return branch


def _missing_table(exc: APIError) -> bool:
    return exc.code in ("42P01", "PGRST205")


def _as_date(value: object) -> str:
    return value.isoformat()[:10] if hasattr(value, "isoformat") else str(value)[:10]


class SupplyStatOut(BaseModel):
    item: str
    count: int
    lastOpened: str
    avgDays: int | None


class SupplyOpeningOut(BaseModel):
    id: str
    branch: Branch
    item: str
    openedOn: str


class SupplyBoardOut(BaseModel):
    openings: list[SupplyOpeningOut]
    stats: list[SupplyStatOut]


class SupplyItemOut(BaseModel):
    id: str
    branch: Branch
    name: str
    unit: SupplyUnit
    quantity: str


class SupplyItemCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    branch: Branch
    name: str = Field(min_length=1, max_length=_ITEM_MAX)
    unit: SupplyUnit
    quantity: str = Field(min_length=1, max_length=16)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = " ".join(sanitize_text(v, _ITEM_MAX).split())
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v

    @model_validator(mode="after")
    def quantity_ok(self) -> SupplyItemCreate:
        quantity_milli(self.quantity, self.unit)
        return self


class SupplyCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    branch: Branch
    item: str = Field(min_length=1, max_length=_ITEM_MAX)
    opened_on: date = Field(alias="openedOn")

    @field_validator("opened_on")
    @classmethod
    def opened_on_bounds(cls, v: date) -> date:
        if v < date(2020, 1, 1) or v > date(2100, 12, 31):
            raise ValueError("La fecha debe estar entre 2020 y 2100.")
        return v

    @field_validator("item")
    @classmethod
    def clean_item(cls, v: str) -> str:
        v = " ".join(sanitize_text(v, _ITEM_MAX).split())
        if not v:
            raise ValueError("El insumo es obligatorio")
        return v


def _row_to_out(row: dict) -> SupplyOpeningOut:
    return SupplyOpeningOut(
        id=str(row["id"]),
        branch=row["branch"],
        item=row["item"],
        openedOn=_as_date(row["opened_on"]),
    )


def _list_openings(branch: str):
    return (
        get_supabase()
        .table("supply_openings")
        .select(_SELECT)
        .eq("branch", branch)
        .order("opened_on", desc=True)
        .order("created_at", desc=True)
        .limit(_LIMIT)
        .execute()
    )


def _insert_opening(body: SupplyCreate, staff_user_id: str):
    return (
        get_supabase()
        .table("supply_openings")
        .insert(
            {
                "branch": body.branch,
                "item": body.item,
                "opened_on": body.opened_on.isoformat(),
                "staff_user_id": staff_user_id,
            }
        )
        .execute()
    )


def _delete_opening(opening_id: str):
    return get_supabase().table("supply_openings").delete().eq("id", opening_id).execute()


def _known_item(branch: str, name: str) -> str | None:
    # ponytail: sin FK. Se valida el nombre al abrir; borrar el artículo deja el historial.
    res = (
        get_supabase()
        .table("supply_items")
        .select("name")
        .eq("branch", branch)
        .eq("name", name)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return str(rows[0]["name"]) if rows else None


def _list_items(branch: str):
    return (
        get_supabase()
        .table("supply_items")
        .select("id, branch, name, unit, quantity_milli")
        .eq("branch", branch)
        .order("name")
        .limit(_ITEM_LIMIT)
        .execute()
    )


def _insert_item(body: SupplyItemCreate, staff_user_id: str):
    return (
        get_supabase()
        .table("supply_items")
        .insert(
            {
                "branch": body.branch,
                "name": body.name,
                "unit": body.unit,
                "quantity_milli": quantity_milli(body.quantity, body.unit),
                "staff_user_id": staff_user_id,
            }
        )
        .execute()
    )


def _delete_item(item_id: str):
    return get_supabase().table("supply_items").delete().eq("id", item_id).execute()


def _item_out(row: dict) -> SupplyItemOut:
    return SupplyItemOut(
        id=str(row["id"]),
        branch=row["branch"],
        name=row["name"],
        unit=row["unit"],
        quantity=format_quantity(row["quantity_milli"]),
    )


async def _run(label: str, fn, *args, missing: str = _MISSING):
    try:
        return await asyncio.to_thread(fn, *args)
    except APIError as exc:
        if _missing_table(exc):
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=missing) from None
        if exc.code in ("42703", "PGRST204") and missing == _MISSING_ITEMS:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MISSING_QTY) from None
        if exc.code == "23505":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Ese artículo ya está dado de alta.") from None
        logger.exception("%s falló", label)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"No se pudo {label}") from None
    except Exception:
        logger.exception("%s falló", label)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"No se pudo {label}") from None


@supplies_router.get("", response_model=SupplyBoardOut)
async def list_supplies(
    branch: str = Query(min_length=1, max_length=40),
    _staff: dict = Depends(require_pos_staff),
):
    res = await _run("leer el inventario", _list_openings, _branch_or_422(branch))
    rows = res.data or []
    openings = [_row_to_out(row) for row in rows]
    stats = opening_stats([(row.item, row.openedOn) for row in openings])
    return SupplyBoardOut(openings=openings, stats=[SupplyStatOut.model_validate(stat) for stat in stats])


@supplies_router.post("", response_model=SupplyOpeningOut, status_code=status.HTTP_201_CREATED)
async def create_supply_opening(body: SupplyCreate, staff: dict = Depends(require_staff_writer)):
    known = await _run("leer los artículos", _known_item, body.branch, body.item, missing=_MISSING_ITEMS)
    if not known:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Elige un artículo dado de alta.")
    body.item = known
    res = await _run("guardar la apertura", _insert_opening, body, staff["user_id"])
    if not res.data:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar la apertura")
    logger.info("audit supply.create user_id=%s opening_id=%s", staff["user_id"], res.data[0]["id"])
    return _row_to_out(res.data[0])


@supplies_router.get("/items", response_model=list[SupplyItemOut])
async def list_supply_items(
    branch: str = Query(min_length=1, max_length=40),
    _staff: dict = Depends(require_pos_staff),
):
    res = await _run("leer los artículos", _list_items, _branch_or_422(branch), missing=_MISSING_ITEMS)
    return [_item_out(row) for row in res.data or []]


@supplies_router.post("/items", response_model=SupplyItemOut, status_code=status.HTTP_201_CREATED)
async def create_supply_item(body: SupplyItemCreate, staff: dict = Depends(require_staff_writer)):
    res = await _run("guardar el artículo", _insert_item, body, staff["user_id"], missing=_MISSING_ITEMS)
    if not res.data:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el artículo")
    logger.info("audit supply_item.create user_id=%s item_id=%s", staff["user_id"], res.data[0]["id"])
    return _item_out(res.data[0])


@supplies_router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supply_item(item_id: UUID, staff: dict = Depends(require_staff_writer)):
    res = await _run("borrar el artículo", _delete_item, str(item_id), missing=_MISSING_ITEMS)
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Artículo no encontrado")
    logger.info("audit supply_item.delete user_id=%s item_id=%s", staff["user_id"], item_id)


@supplies_router.delete("/{opening_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supply_opening(opening_id: UUID, staff: dict = Depends(require_staff_writer)):
    res = await _run("borrar la apertura", _delete_opening, str(opening_id))
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Apertura no encontrada")
    logger.info("audit supply.delete user_id=%s opening_id=%s", staff["user_id"], opening_id)
