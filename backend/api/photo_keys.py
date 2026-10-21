from __future__ import annotations

_EXT = {"image/jpeg": "jpg", "image/webp": "webp"}


def is_http_url(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def is_r2_key(value: str) -> bool:
    return bool(value) and not is_http_url(value)


def object_key(staff_user_id: str, photo_id: str, content_type: str) -> str:
    if "/" in staff_user_id or "/" in photo_id:
        raise ValueError("id inválido")
    return f"orders/{staff_user_id}/{photo_id}.{_EXT[content_type]}"


def thumb_key(key: str) -> str | None:
    """Mismo key con `_thumb.webp` antes de la extensión. Una URL http no es key."""
    if not is_r2_key(key):
        return None
    base, dot, ext = key.rpartition(".")
    if not dot or not ext or "/" in ext:
        return None
    return f"{base}_thumb.webp"


def file_target(stored: str, variant: str | None) -> str | None:
    if variant == "thumb":
        return thumb_key(stored)
    if is_http_url(stored) or is_r2_key(stored):
        return stored
    return None
