from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..")
load_dotenv(dotenv_path=os.path.join(_BACKEND_DIR, ".env.local"))
load_dotenv(dotenv_path=os.path.join(_BACKEND_DIR, ".env"))

DB_SCHEMA = "tintoreria_francia"
# El personal inicia sesión con teléfono; Supabase Auth lo guarda como <10 dígitos>@<dominio>.
# Debe coincidir con STAFF_LOGIN_DOMAIN en frontend/lib/staff-login.ts.
STAFF_LOGIN_DOMAIN = "usuarios.tintoreriafrancia.local"


def _env(*names: str) -> str | None:
    for n in names:
        v = os.getenv(n)
        if v:
            return v.strip()
    return None


@lru_cache
def get_supabase_url() -> str | None:
    return _env("SUPABASE_URL", "supabase_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")


@lru_cache
def get_supabase_service_role_key() -> str | None:
    return _env("SUPABASE_SERVICE_ROLE_KEY", "supabase_SUPABASE_SERVICE_ROLE_KEY")


@lru_cache
def get_supabase_jwt_secret() -> str | None:
    return _env("SUPABASE_JWT_SECRET", "JWT_SECRET")


def get_cors_extra_origins() -> list[str]:
    raw = os.getenv("CORS_EXTRA_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]


def is_database_configured() -> bool:
    return bool(get_supabase_url() and get_supabase_service_role_key())
