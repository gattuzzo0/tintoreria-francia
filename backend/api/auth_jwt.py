from __future__ import annotations

import asyncio

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import get_supabase_jwt_secret, get_supabase_service_role_key, get_supabase_url

security = HTTPBearer(auto_error=False)


def _decode_via_supabase_user_api(token: str) -> dict:
    """Valida el token con Supabase /auth/v1/user (JWT signing keys nuevos)."""
    url_base = get_supabase_url()
    key = get_supabase_service_role_key()
    if not url_base or not key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY para validar la sesión",
        )
    try:
        r = httpx.get(
            f"{url_base.rstrip('/')}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": key},
            timeout=15.0,
        )
    except httpx.HTTPError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo contactar a Supabase Auth",
        ) from None

    if r.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    u = r.json()
    uid = u.get("id")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    return {"sub": str(uid), "email": u.get("email")}


def decode_supabase_access_token(token: str) -> dict:
    secret = get_supabase_jwt_secret()
    if secret:
        try:
            return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated", leeway=120)
        except jwt.PyJWTError:
            pass  # Cae a la Auth API si el JWT no es HS256 con este secreto.
    return _decode_via_supabase_user_api(token)


async def require_access_token(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere Authorization: Bearer <access_token>",
        )
    return await asyncio.to_thread(decode_supabase_access_token, creds.credentials)
