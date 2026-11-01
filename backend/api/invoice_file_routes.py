from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field

from api.config import is_storage_configured
from api.deps import require_pos_staff, require_staff_writer
from api.invoice_files import COLUMN, CONTENT_TYPE, MAX_BYTES, invoice_object_key, sniff_invoice
from api.r2_client import delete_object, object_meta, presign_get, presign_put, read_object_prefix
from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)
invoice_file_router = APIRouter()

InvoiceKind = Literal["pdf", "xml"]
_MIGRATION = "Aplica la migración 000014 en el SQL Editor."


class InvoicePresignIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    kind: InvoiceKind
    byte_size: int = Field(alias="byteSize", ge=1, le=MAX_BYTES)


class InvoicePresignOut(BaseModel):
    fileId: str
    key: str
    putUrl: str


class InvoiceConfirmIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    kind: InvoiceKind
    file_id: str = Field(alias="fileId", min_length=36, max_length=36)
    key: str = Field(min_length=1, max_length=120)


class InvoiceUrlOut(BaseModel):
    url: str


def _require_storage() -> None:
    if not is_storage_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Almacenamiento no configurado")


def _load_order(folio: int):
    return (
        get_supabase()
        .table("orders")
        .select("folio, wants_invoice, invoice_pdf_key, invoice_xml_key")
        .eq("folio", folio)
        .limit(1)
        .execute()
    )


def _save_key(folio: int, column: str, key: str):
    return (
        get_supabase()
        .table("orders")
        .update({column: key})
        .eq("folio", folio)
        .eq("wants_invoice", True)
        .execute()
    )


async def _invoice_order(folio: int) -> dict:
    try:
        res = await asyncio.to_thread(_load_order, folio)
    except APIError as exc:
        if exc.code == "42703":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MIGRATION) from None
        logger.exception("Lectura de factura falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la orden") from None
    except Exception:
        logger.exception("Lectura de factura falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la orden") from None
    rows = res.data or []
    if not rows or not rows[0].get("wants_invoice"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return rows[0]


def _expected_key(folio: int, file_id: str, kind: str) -> str:
    try:
        return invoice_object_key(folio, file_id, kind)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Archivo inválido") from None


@invoice_file_router.post("/{folio}/invoice-files/presign", response_model=InvoicePresignOut)
async def presign_invoice_file(
    folio: int,
    body: InvoicePresignIn,
    staff: dict = Depends(require_staff_writer),
):
    _require_storage()
    await _invoice_order(folio)
    file_id = str(uuid.uuid4())
    key = _expected_key(folio, file_id, body.kind)
    try:
        put_url = await asyncio.to_thread(presign_put, key, CONTENT_TYPE[body.kind])
    except Exception:
        logger.exception("No se pudo firmar la factura folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo preparar la subida") from None
    logger.info("audit invoice.presign user_id=%s folio=%s kind=%s", staff["user_id"], folio, body.kind)
    return InvoicePresignOut(fileId=file_id, key=key, putUrl=put_url)


@invoice_file_router.post("/{folio}/invoice-files", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_invoice_file(
    folio: int,
    body: InvoiceConfirmIn,
    staff: dict = Depends(require_staff_writer),
):
    _require_storage()
    row = await _invoice_order(folio)
    key = _expected_key(folio, body.file_id, body.kind)
    if body.key != key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="La clave no corresponde a esta orden")
    try:
        meta = await asyncio.to_thread(object_meta, key)
        prefix = await asyncio.to_thread(read_object_prefix, key) if meta else b""
    except Exception:
        logger.exception("No se pudo leer la factura subida folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer el archivo") from None
    valid = bool(meta) and 1 <= int(meta["byteSize"]) <= MAX_BYTES and sniff_invoice(body.kind, prefix)
    if not valid:
        await asyncio.to_thread(delete_object, key)
        detail = "El archivo no es un PDF válido." if body.kind == "pdf" else "El archivo no es un XML válido."
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)
    column = COLUMN[body.kind]
    previous = str(row.get(column) or "")
    try:
        saved = await asyncio.to_thread(_save_key, folio, column, key)
    except APIError as exc:
        if exc.code == "42703":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=_MIGRATION) from None
        logger.exception("Guardar factura falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el archivo") from None
    except Exception:
        logger.exception("Guardar factura falló folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar el archivo") from None
    if not saved.data:
        await asyncio.to_thread(delete_object, key)
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if previous and previous != key:
        try:
            await asyncio.to_thread(delete_object, previous)
        except Exception:
            logger.exception("No se pudo borrar la factura anterior folio=%s", folio)
    logger.info("audit invoice.file user_id=%s folio=%s kind=%s", staff["user_id"], folio, body.kind)


@invoice_file_router.get("/{folio}/invoice-files/{kind}", response_model=InvoiceUrlOut)
async def read_invoice_file(
    folio: int,
    kind: InvoiceKind,
    _staff: dict = Depends(require_pos_staff),
):
    _require_storage()
    row = await _invoice_order(folio)
    key = str(row.get(COLUMN[kind]) or "")
    if not key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Archivo no cargado")
    try:
        url = await asyncio.to_thread(presign_get, key)
    except Exception:
        logger.exception("No se pudo firmar la factura folio=%s", folio)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo abrir el archivo") from None
    return InvoiceUrlOut(url=url)
