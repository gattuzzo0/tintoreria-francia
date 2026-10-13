from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from supabase_auth.errors import AuthApiError

from api.config import STAFF_LOGIN_DOMAIN
from api.deps import require_admin, require_admin_writer
from api.supabase_client import get_supabase
from api.validation import format_phone

logger = logging.getLogger(__name__)
admins_router = APIRouter()

_PHONE_RE = re.compile(r"^[0-9]{10}$")


StaffRole = Literal["admin", "empleado"]


class AdminOut(BaseModel):
    userId: str
    phone: str | None
    role: StaffRole
    createdAt: str


class AdminCreate(BaseModel):
    phone: str = Field(max_length=10)
    role: StaffRole = "admin"
    # Supabase Auth trunca en 72 bytes (bcrypt).
    password: str = Field(max_length=72)

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("El teléfono debe tener exactamente 10 dígitos, sin espacios ni símbolos.")
        return v

    @field_validator("password")
    @classmethod
    def password_ok(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        if v.strip() != v:
            raise ValueError("La contraseña no puede empezar ni terminar con espacios.")
        return v


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _phone_from_login_email(email: str | None) -> str | None:
    local, _, domain = (email or "").partition("@")
    return format_phone(local) if domain == STAFF_LOGIN_DOMAIN and _PHONE_RE.match(local) else None


def _list_admins() -> list[AdminOut]:
    sb = get_supabase()
    rows = (
        sb.table("profiles")
        .select("id, role, created_at")
        .in_("role", ["admin", "empleado"])
        .order("created_at")
        .execute()
        .data
        or []
    )
    # ponytail: una sola página de Auth; suficiente para el personal de una tintorería.
    emails = {str(u.id): u.email for u in sb.auth.admin.list_users(per_page=1000)}
    return [
        AdminOut(
            userId=str(r["id"]),
            phone=_phone_from_login_email(emails.get(str(r["id"]))),
            role=r["role"],
            createdAt=_iso(r["created_at"]),
        )
        for r in rows
    ]


def _create_admin(body: AdminCreate) -> AdminOut:
    sb = get_supabase()
    email = f"{body.phone}@{STAFF_LOGIN_DOMAIN}"
    user = sb.auth.admin.create_user({"email": email, "password": body.password, "email_confirm": True}).user
    try:
        row = sb.table("profiles").insert({"id": user.id, "role": body.role}).execute().data[0]
    except Exception:
        sb.auth.admin.delete_user(user.id)
        raise
    return AdminOut(
        userId=str(user.id), phone=format_phone(body.phone), role=body.role, createdAt=_iso(row["created_at"])
    )


def _revoke_staff(user_id: str) -> bool:
    sb = get_supabase()
    # Solo cuentas con perfil de esta app: el proyecto Supabase es compartido con otras apps.
    if not sb.table("profiles").select("id").eq("id", user_id).limit(1).execute().data:
        return False
    # Borrar el usuario de Auth elimina el perfil en cascada; órdenes y notas conservan el registro
    # con staff_user_id = null.
    sb.auth.admin.delete_user(user_id)
    return True


@admins_router.get("", response_model=list[AdminOut])
async def list_admins(_admin: dict = Depends(require_admin)):
    try:
        return await asyncio.to_thread(_list_admins)
    except Exception:
        logger.exception("list_admins falló")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo leer el personal") from None


@admins_router.post("", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
async def create_admin(body: AdminCreate, admin: dict = Depends(require_admin_writer)):
    try:
        created = await asyncio.to_thread(_create_admin, body)
    except AuthApiError as e:
        if e.code == "email_exists" or (e.status == 422 and "registered" in e.message):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Ya existe un usuario con ese teléfono.") from None
        if e.code == "weak_password":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La contraseña es demasiado débil."
            ) from None
        logger.exception("create_admin: Supabase Auth rechazó la alta by=%s", admin["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo crear el usuario") from None
    except Exception:
        logger.exception("create_admin falló by=%s", admin["user_id"])
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo crear el usuario") from None
    logger.info("audit staff.create by=%s user_id=%s role=%s", admin["user_id"], created.userId, created.role)
    return created


@admins_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_staff(user_id: UUID, admin: dict = Depends(require_admin_writer)):
    target = str(user_id)
    if target == admin["user_id"]:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="No puedes revocar tu propio acceso.")
    try:
        found = await asyncio.to_thread(_revoke_staff, target)
    except Exception:
        logger.exception("revoke_staff falló by=%s user_id=%s", admin["user_id"], target)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="No se pudo revocar el acceso") from None
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    logger.info("audit staff.revoke by=%s user_id=%s", admin["user_id"], target)
