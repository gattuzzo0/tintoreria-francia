from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

from api.deps import require_pos_staff, require_staff_writer
from api.supabase_client import get_supabase
from api.validation import NAME_MAX, digits_only, is_valid_person_name, normalize_name

logger = logging.getLogger(__name__)
customers_router = APIRouter()


class CustomerOut(BaseModel):
    id: str
    name: str
    phone: str
    email: str | None


class CustomerCreate(BaseModel):
    name: str = Field(max_length=200)
    phone: str = Field(max_length=40)

    @field_validator("name")
    @classmethod
    def name_ok(cls, v: str) -> str:
        v = normalize_name(v)
        if not v:
            raise ValueError("El nombre es obligatorio.")
        if len(v) > NAME_MAX:
            raise ValueError("Máximo 60 caracteres.")
        if not is_valid_person_name(v):
            raise ValueError("Solo letras; escribe nombre y apellido.")
        return v

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v: str) -> str:
        d = digits_only(v)
        if not d:
            raise ValueError("El teléfono es obligatorio.")
        if len(d) != 10:
            raise ValueError("Debe tener exactamente 10 dígitos.")
        return d


def _row_to_customer_out(row: dict) -> CustomerOut:
    return CustomerOut(id=str(row["id"]), name=row["name"], phone=row["phone"], email=row.get("email"))


def _fetch_customers():
    return get_supabase().table("customers").select("id, name, phone, email").order("created_at", desc=True).execute()


def _insert_customer(body: CustomerCreate, user_id: str):
    return (
        get_supabase()
        .table("customers")
        .insert({"name": body.name, "phone": body.phone, "created_by": user_id})
        .execute()
    )


@customers_router.get("", response_model=list[CustomerOut])
async def list_customers(_staff: dict = Depends(require_pos_staff)):
    try:
        res = await asyncio.to_thread(_fetch_customers)
    except Exception:
        logger.exception("list_customers falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron leer los clientes") from None
    return [_row_to_customer_out(r) for r in res.data or []]


@customers_router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(body: CustomerCreate, staff: dict = Depends(require_staff_writer)):
    try:
        res = await asyncio.to_thread(_insert_customer, body, staff["user_id"])
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya existe un cliente con ese teléfono.") from None
        logger.exception("create_customer falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el cliente") from None
    except Exception:
        logger.exception("create_customer falló user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el cliente") from None
    logger.info("audit customer.create user_id=%s customer_id=%s", staff["user_id"], res.data[0]["id"])
    return _row_to_customer_out(res.data[0])
