from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.config import is_storage_configured
from api.deps import require_pos_staff, require_staff_writer
from api.photo_keys import file_target, is_http_url, object_key, thumb_key
from api.r2_client import delete_object, object_exists, presign_get, presign_put
from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)
order_photo_router = APIRouter()

MAX_BYTES = 4_000_000
ImageType = Literal["image/jpeg", "image/webp"]

# max-age solo no cachea en el edge. CDN-Cache-Control con s-maxage sí.
FILE_REDIRECT_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400",
    "CDN-Cache-Control": "public, s-maxage=86400",
}


class OrderPhotoOut(BaseModel):
    id: str


class PresignIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    content_type: ImageType = Field(alias="contentType")


class PresignOut(BaseModel):
    id: str
    key: str
    putUrl: str
    thumbKey: str
    thumbPutUrl: str


class RegisterIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    key: str
    content_type: ImageType = Field(alias="contentType")
    byte_size: int = Field(alias="byteSize", ge=1, le=MAX_BYTES)
    width: int = Field(ge=1, le=1080)
    height: int = Field(ge=1, le=1440)

    @field_validator("id")
    @classmethod
    def id_is_uuid(cls, value: str) -> str:
        try:
            uuid.UUID(value)
        except ValueError:
            raise ValueError("id inválido") from None
        return value


class PhotoUrlOut(BaseModel):
    url: str


def _fetch_photo(photo_id: str):
    return (
        get_supabase()
        .table("order_photos")
        .select("id, order_folio, staff_user_id, object_key, content_type")
        .eq("id", photo_id)
        .limit(1)
        .execute()
    )


def _insert_photo(row: dict):
    return get_supabase().table("order_photos").insert(row).execute()


def _delete_photo_row(photo_id: str, staff_user_id: str):
    return (
        get_supabase()
        .table("order_photos")
        .delete()
        .eq("id", photo_id)
        .eq("staff_user_id", staff_user_id)
        .is_("order_folio", "null")
        .execute()
    )


def _link_photo(photo_id: str, folio: int, staff_user_id: str):
    return (
        get_supabase()
        .table("order_photos")
        .update({"order_folio": folio})
        .eq("id", photo_id)
        .eq("staff_user_id", staff_user_id)
        .is_("order_folio", "null")
        .execute()
    )


def _require_storage() -> None:
    if not is_storage_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Almacenamiento no configurado")


async def _load_photo(photo_id: str) -> dict:
    try:
        res = await asyncio.to_thread(_fetch_photo, photo_id)
    except Exception:
        logger.exception("Lectura de foto falló photo_id=%s", photo_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la foto") from None
    rows = res.data or []
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    return rows[0]


def _visible(row: dict, staff_user_id: str) -> bool:
    if row.get("order_folio") is not None:
        return True
    return str(row.get("staff_user_id") or "") == staff_user_id


def prepare_order_photo(photo_id: str, staff_user_id: str) -> None:
    res = _fetch_photo(photo_id)
    rows = res.data or []
    if not rows or str(rows[0].get("staff_user_id") or "") != staff_user_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Foto no encontrada")


def attach_order_photo(photo_id: str, folio: int, staff_user_id: str) -> None:
    """Liga una foto pendiente a la orden. Si ya está en esa orden, no hace nada."""
    res = _fetch_photo(photo_id)
    rows = res.data or []
    if not rows or str(rows[0].get("staff_user_id") or "") != staff_user_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Foto no encontrada")
    linked = rows[0].get("order_folio")
    if linked is not None:
        if int(linked) != folio:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="La foto ya pertenece a otra orden")
        return
    updated = _link_photo(photo_id, folio, staff_user_id)
    if not updated.data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No se pudo ligar la foto a la orden")


def _redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=302, headers=FILE_REDIRECT_HEADERS)


async def _signed_or_legacy(stored: str, variant: str | None) -> str:
    target = file_target(stored, variant)
    if target is None:
        detail = "Miniatura no encontrada" if variant == "thumb" else "Foto no encontrada"
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=detail)
    if is_http_url(target):
        return target
    _require_storage()
    # ponytail: fotos viejas no tienen _thumb.webp. Firmar el original evita el 404 del <img>.
    if variant == "thumb":
        try:
            found = await asyncio.to_thread(object_exists, target)
        except Exception:
            logger.exception("No se pudo comprobar la miniatura")
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la imagen") from None
        if not found:
            target = stored
    try:
        return await asyncio.to_thread(presign_get, target)
    except Exception:
        logger.exception("No se pudo firmar la lectura")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer la imagen") from None


@order_photo_router.post("/photos/presign", response_model=PresignOut)
async def presign_order_photo(body: PresignIn, staff: dict = Depends(require_staff_writer)):
    _require_storage()
    photo_id = str(uuid.uuid4())
    key = object_key(staff["user_id"], photo_id, body.content_type)
    thumb = thumb_key(key)
    if thumb is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No se pudo armar la miniatura")
    try:
        put_url = await asyncio.to_thread(presign_put, key, body.content_type)
        thumb_put_url = await asyncio.to_thread(presign_put, thumb, "image/webp")
    except Exception:
        logger.exception("No se pudo firmar la subida user_id=%s", staff["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo preparar la subida") from None
    return PresignOut(id=photo_id, key=key, putUrl=put_url, thumbKey=thumb, thumbPutUrl=thumb_put_url)


@order_photo_router.post("/photos", response_model=OrderPhotoOut, status_code=status.HTTP_201_CREATED)
async def register_order_photo(body: RegisterIn, staff: dict = Depends(require_staff_writer)):
    try:
        expected = object_key(staff["user_id"], body.id, body.content_type)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="id inválido") from None
    if body.key != expected:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="La clave no corresponde a esta foto")
    try:
        await asyncio.to_thread(
            _insert_photo,
            {
                "id": body.id,
                "staff_user_id": staff["user_id"],
                "object_key": expected,
                "content_type": body.content_type,
                "byte_size": body.byte_size,
                "width": body.width,
                "height": body.height,
            },
        )
    except Exception:
        logger.exception("Insert de foto falló user_id=%s photo_id=%s", staff["user_id"], body.id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo guardar la foto") from None
    logger.info("audit order.photo user_id=%s photo_id=%s", staff["user_id"], body.id)
    return OrderPhotoOut(id=body.id)


@order_photo_router.get("/photos/{photo_id}/file")
async def read_order_photo_file(photo_id: uuid.UUID, v: str | None = Query(default=None)):
    """<img> sin crossOrigin. Sin Authorization: el tag no manda Bearer."""
    if v not in (None, "thumb"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="v debe ser thumb")
    row = await _load_photo(str(photo_id))
    url = await _signed_or_legacy(str(row["object_key"]), v)
    return _redirect(url)


@order_photo_router.get("/photos/{photo_id}/url", response_model=PhotoUrlOut)
async def read_order_photo_url(photo_id: uuid.UUID, staff: dict = Depends(require_pos_staff)):
    """Canvas, clipboard o recorte. El cliente asigna esta URL a img.src."""
    row = await _load_photo(str(photo_id))
    if not _visible(row, staff["user_id"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    url = await _signed_or_legacy(str(row["object_key"]), None)
    return PhotoUrlOut(url=url)


@order_photo_router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order_photo(photo_id: uuid.UUID, staff: dict = Depends(require_staff_writer)):
    _require_storage()
    row = await _load_photo(str(photo_id))
    if row.get("order_folio") is not None or str(row.get("staff_user_id") or "") != staff["user_id"]:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="La foto ya está en una orden")
    stored = str(row["object_key"])
    thumb = thumb_key(stored)
    try:
        await asyncio.to_thread(delete_object, stored)
        if thumb:
            await asyncio.to_thread(delete_object, thumb)
        await asyncio.to_thread(_delete_photo_row, str(photo_id), staff["user_id"])
    except Exception:
        logger.exception("Borrado de foto falló photo_id=%s", photo_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo borrar la foto") from None
    logger.info("audit order.photo.delete user_id=%s photo_id=%s", staff["user_id"], photo_id)
