from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import require_admin_writer, require_pos_staff
from api.supabase_client import get_supabase
from api.validation import NAME_MAX, sanitize_text

logger = logging.getLogger(__name__)
catalog_router = APIRouter()

Category = Literal["Prendas", "Trajes", "Hogar", "Especiales"]
Unit = Literal["pza", "kg", "par"]
_SELECT = "id, name, category, unit, price_cents, image_path, active, sort_order"
# Precios en pesos enteros de 1 a 99,999, guardados en centavos.
_PRICE_MAX_CENTS = 99_999 * 100


def _whole_pesos(v: int | None) -> int | None:
    if v is not None and v % 100 != 0:
        raise ValueError("El precio debe ser en pesos enteros, sin centavos.")
    return v


class ServiceOut(BaseModel):
    id: str
    name: str
    category: Category
    unit: Unit
    priceCents: int
    imagePath: str | None
    active: bool


class ServiceCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=NAME_MAX)
    category: Category
    unit: Unit
    price_cents: int = Field(alias="priceCents", ge=100, le=_PRICE_MAX_CENTS, strict=True)

    price_ok = field_validator("price_cents")(_whole_pesos)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = " ".join(sanitize_text(v, NAME_MAX).split())
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v


class ServiceUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX)
    category: Category | None = None
    unit: Unit | None = None
    price_cents: int | None = Field(default=None, alias="priceCents", ge=100, le=_PRICE_MAX_CENTS, strict=True)
    active: bool | None = None

    price_ok = field_validator("price_cents")(_whole_pesos)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(sanitize_text(v, NAME_MAX).split())
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v


def _row_to_service_out(row: dict) -> ServiceOut:
    return ServiceOut(
        id=str(row["id"]),
        name=row["name"],
        category=row["category"],
        unit=row["unit"],
        priceCents=int(row["price_cents"]),
        imagePath=row.get("image_path"),
        active=bool(row["active"]),
    )


def _fetch_services(include_inactive: bool):
    q = get_supabase().table("services").select(_SELECT)
    if not include_inactive:
        q = q.eq("active", True)
    return q.order("sort_order").order("created_at").execute()


def _insert_service(body: ServiceCreate):
    return (
        get_supabase()
        .table("services")
        .insert(
            {
                "name": body.name,
                "category": body.category,
                "unit": body.unit,
                "price_cents": body.price_cents,
                "sort_order": 1000,
            }
        )
        .execute()
    )


def _update_service(service_id: str, patch: dict):
    return get_supabase().table("services").update(patch).eq("id", service_id).execute()


def _delete_service(service_id: str):
    return get_supabase().table("services").delete().eq("id", service_id).execute()


@catalog_router.get("/services", response_model=list[ServiceOut])
async def list_services(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    staff: dict = Depends(require_pos_staff),
):
    if include_inactive and staff["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Se requiere rol de administrador")
    try:
        res = await asyncio.to_thread(_fetch_services, include_inactive)
    except Exception:
        logger.exception("list_services falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer el catálogo") from None
    return [_row_to_service_out(r) for r in res.data or []]


@catalog_router.post("/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
async def create_service(body: ServiceCreate, admin: dict = Depends(require_admin_writer)):
    try:
        res = await asyncio.to_thread(_insert_service, body)
    except Exception:
        logger.exception("create_service falló user_id=%s", admin["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo crear el servicio") from None
    logger.info("audit service.create user_id=%s service_id=%s", admin["user_id"], res.data[0]["id"])
    return _row_to_service_out(res.data[0])


@catalog_router.patch("/services/{service_id}", response_model=ServiceOut)
async def update_service(service_id: str, body: ServiceUpdate, admin: dict = Depends(require_admin_writer)):
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No hay cambios que guardar")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        res = await asyncio.to_thread(_update_service, service_id, patch)
    except Exception:
        logger.exception("update_service falló service_id=%s", service_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo actualizar el servicio") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")
    logger.info("audit service.update user_id=%s service_id=%s fields=%s", admin["user_id"], service_id, sorted(patch))
    return _row_to_service_out(res.data[0])


@catalog_router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(service_id: str, admin: dict = Depends(require_admin_writer)):
    try:
        res = await asyncio.to_thread(_delete_service, service_id)
    except APIError as e:
        if e.code == "23503":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Este servicio ya aparece en órdenes; desactívalo en lugar de eliminarlo.",
            ) from None
        logger.exception("delete_service falló service_id=%s", service_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo eliminar el servicio") from None
    except Exception:
        logger.exception("delete_service falló service_id=%s", service_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo eliminar el servicio") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")
    logger.info("audit service.delete user_id=%s service_id=%s", admin["user_id"], service_id)
