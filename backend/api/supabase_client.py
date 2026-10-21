from __future__ import annotations

from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from api.config import DB_SCHEMA, get_supabase_service_role_key, get_supabase_url


@lru_cache
def get_supabase() -> Client:
    url = get_supabase_url()
    key = get_supabase_service_role_key()
    if not url or not key:
        raise RuntimeError("Supabase URL o service role key no configurados")
    # ponytail: postgrest default http2=True. Idle HTTP/2 dies on long-lived uvicorn
    # ("Server disconnected" → 503). Vercel process is short, so prod hides it.
    return create_client(
        url,
        key,
        options=ClientOptions(
            schema=DB_SCHEMA,
            httpx_client=httpx.Client(
                http2=False,
                timeout=120,
                limits=httpx.Limits(max_keepalive_connections=0),
            ),
        ),
    )


def call_rpc(fn: str, payload: dict) -> object:
    """RPC escalar vía PostgREST (postgrest-py falla con respuestas escalares)."""
    url = get_supabase_url()
    key = get_supabase_service_role_key()
    if not url or not key:
        raise RuntimeError("Supabase URL o service role key no configurados")
    with httpx.Client(timeout=60.0) as http:
        r = http.post(
            f"{url.rstrip('/')}/rest/v1/rpc/{fn}",
            json=payload,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Content-Profile": DB_SCHEMA,
                "Accept-Profile": DB_SCHEMA,
            },
        )
    if r.is_error:
        is_json = r.headers.get("content-type", "").startswith("application/json")
        body = r.json() if is_json else {}
        raise RpcError(r.status_code, body.get("code"), body.get("message", r.text))
    return r.json()


class RpcError(Exception):
    def __init__(self, status: int, code: str | None, message: str):
        super().__init__(f"PostgREST {status} ({code}): {message}")
        self.status = status
        self.code = code
        self.message = message
