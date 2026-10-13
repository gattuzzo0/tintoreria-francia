from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from api.admins_routes import admins_router
from api.auth_jwt import require_access_token
from api.catalog_routes import catalog_router
from api.config import is_database_configured
from api.customers_routes import customers_router
from api.deps import STAFF_ROLES, fetch_profile
from api.orders_routes import orders_router
from api.reports_routes import reports_router
from api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

api_router = APIRouter()
api_router.include_router(admins_router, prefix="/admins")
api_router.include_router(catalog_router, prefix="/catalog")
api_router.include_router(customers_router, prefix="/customers")
api_router.include_router(orders_router, prefix="/orders")
api_router.include_router(reports_router, prefix="/reports")


@api_router.get("/health")
async def health():
    if not is_database_configured():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"ok": False, "detail": "Base de datos no configurada"},
        )

    def ping():
        get_supabase().table("services").select("id").limit(1).execute()

    try:
        await asyncio.to_thread(ping)
    except Exception:
        logger.exception("Health check: fallo al consultar Supabase")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"ok": False, "detail": "No se pudo conectar a Supabase"},
        )
    return {"ok": True, "database": "connected"}


@api_router.get("/me")
async def me(claims: dict = Depends(require_access_token)):
    if not is_database_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Base de datos no configurada")
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token sin identificador de usuario")
    try:
        profile = await asyncio.to_thread(fetch_profile, user_id)
    except Exception:
        logger.exception("/me: error leyendo profiles user_id=%s", user_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Error al leer el perfil") from None

    role = profile.get("role") if profile else None
    return {
        "userId": user_id,
        "email": claims.get("email"),
        "fullName": profile.get("full_name") if profile else None,
        "role": role,
        "canAccessPos": role in STAFF_ROLES,
        "isAdmin": role == "admin",
    }
