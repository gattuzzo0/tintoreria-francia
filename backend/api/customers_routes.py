from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.deps import require_pos_staff, require_staff_writer
from api.supabase_client import get_supabase
from api.validation import (
    NAME_MAX,
    digits_only,
    is_valid_person_name,
    normalize_cfdi_use,
    normalize_fiscal_zip,
    normalize_legal_name,
    normalize_name,
    normalize_rfc,
    normalize_tax_regime,
)

logger = logging.getLogger(__name__)
customers_router = APIRouter()


class CustomerOut(BaseModel):
    id: str
    name: str
    phone: str
    email: str | None
    rfc: str | None = None
    legalName: str | None = None
    fiscalZip: str | None = None
    taxRegime: str | None = None
    cfdiUse: str | None = None


def _optional(fn, value):
    try:
        return fn(value)
    except ValueError as exc:
        raise ValueError(str(exc)) from None


class CustomerFiscalUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rfc: str | None = None
    legal_name: str | None = Field(default=None, alias="legalName")
    fiscal_zip: str | None = Field(default=None, alias="fiscalZip")
    tax_regime: str | None = Field(default=None, alias="taxRegime")
    cfdi_use: str | None = Field(default=None, alias="cfdiUse")

    @field_validator("rfc")
    @classmethod
    def rfc_ok(cls, v: str | None) -> str | None:
        return _optional(normalize_rfc, v)

    @field_validator("legal_name")
    @classmethod
    def legal_name_ok(cls, v: str | None) -> str | None:
        return _optional(normalize_legal_name, v)

    @field_validator("fiscal_zip")
    @classmethod
    def zip_ok(cls, v: str | None) -> str | None:
        return _optional(normalize_fiscal_zip, v)

    @field_validator("tax_regime")
    @classmethod
    def regime_ok(cls, v: str | None) -> str | None:
        return _optional(normalize_tax_regime, v)

    @field_validator("cfdi_use")
    @classmethod
    def use_ok(cls, v: str | None) -> str | None:
        return _optional(normalize_cfdi_use, v)


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
    return CustomerOut(
        id=str(row["id"]),
        name=row["name"],
        phone=row["phone"],
        email=row.get("email"),
        rfc=row.get("rfc"),
        legalName=row.get("legal_name"),
        fiscalZip=row.get("fiscal_zip"),
        taxRegime=row.get("tax_regime"),
        cfdiUse=row.get("cfdi_use"),
    )


_CUSTOMER_SELECTS = (
    "id, name, phone, email, rfc, legal_name, fiscal_zip, tax_regime, cfdi_use",
    "id, name, phone, email, rfc",
    "id, name, phone, email",
)


def _fetch_customers():
    last: APIError | None = None
    for columns in _CUSTOMER_SELECTS:
        try:
            return get_supabase().table("customers").select(columns).order("created_at", desc=True).execute()
        except APIError as exc:
            if exc.code != "42703":
                raise
            last = exc
            logger.warning("Lectura de clientes sin columnas nuevas; aplica migraciones 000012 y 000013")
    raise last if last else APIError({"code": "42703", "message": "columnas de cliente"})


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


_FISCAL_COLUMNS = {
    "rfc": "rfc",
    "legal_name": "legal_name",
    "fiscal_zip": "fiscal_zip",
    "tax_regime": "tax_regime",
    "cfdi_use": "cfdi_use",
}


def _update_customer_fiscal(customer_id: str, data: dict):
    return get_supabase().table("customers").update(data).eq("id", customer_id).execute()


@customers_router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer_fiscal(
    customer_id: str,
    body: CustomerFiscalUpdate,
    staff: dict = Depends(require_staff_writer),
):
    data = {column: getattr(body, name) for name, column in _FISCAL_COLUMNS.items() if name in body.model_fields_set}
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Nada que guardar.")
    try:
        res = await asyncio.to_thread(_update_customer_fiscal, customer_id, data)
    except APIError as e:
        if e.code == "23514":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Datos fiscales inválidos.") from None
        if e.code == "42703":
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Faltan columnas fiscales. Aplica las migraciones 000012 y 000013 en Supabase.",
            ) from None
        logger.exception("update_customer_fiscal falló user_id=%s customer_id=%s", staff["user_id"], customer_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron guardar los datos fiscales") from None
    except Exception:
        logger.exception("update_customer_fiscal falló user_id=%s customer_id=%s", staff["user_id"], customer_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudieron guardar los datos fiscales") from None
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    logger.info("audit customer.fiscal user_id=%s customer_id=%s", staff["user_id"], customer_id)
    return _row_to_customer_out(res.data[0])
