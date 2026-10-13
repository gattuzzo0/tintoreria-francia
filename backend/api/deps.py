from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, status

from api.auth_jwt import require_access_token
from api.config import is_database_configured
from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

STAFF_ROLES = ("admin", "empleado")


def fetch_profile(user_id: str) -> dict | None:
    res = get_supabase().table("profiles").select("id, role, full_name").eq("id", user_id).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


async def _load_staff(claims: dict) -> dict:
    if not is_database_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Base de datos no configurada")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token sin identificador de usuario")

    try:
        profile = await asyncio.to_thread(fetch_profile, user_id)
    except Exception:
        logger.exception("Error leyendo profiles user_id=%s", user_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Error al leer el perfil") from None

    return {"user_id": user_id, "role": profile.get("role") if profile else None, "email": claims.get("email")}


async def require_pos_staff(claims: dict = Depends(require_access_token)) -> dict:
    """Usuario con rol admin o empleado."""
    staff = await _load_staff(claims)
    if staff["role"] not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Se requiere rol de administrador o empleado")
    return staff


async def require_admin(claims: dict = Depends(require_access_token)) -> dict:
    staff = await _load_staff(claims)
    if staff["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Se requiere rol de administrador")
    return staff


# ponytail: ventana en memoria por instancia; en serverless cada instancia cuenta aparte.
# Si se necesita límite global, moverlo a Postgres o a un KV.
_WINDOW_SECONDS = 60
_MAX_WRITES_PER_WINDOW = 60
_writes: dict[str, deque[float]] = defaultdict(deque)


def enforce_write_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    q = _writes[user_id]
    while q and now - q[0] > _WINDOW_SECONDS:
        q.popleft()
    if len(q) >= _MAX_WRITES_PER_WINDOW:
        retry = int(_WINDOW_SECONDS - (now - q[0])) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes; intenta de nuevo en un momento",
            headers={"Retry-After": str(retry)},
        )
    q.append(now)


async def require_staff_writer(staff: dict = Depends(require_pos_staff)) -> dict:
    enforce_write_rate_limit(staff["user_id"])
    return staff


async def require_admin_writer(admin: dict = Depends(require_admin)) -> dict:
    enforce_write_rate_limit(admin["user_id"])
    return admin
