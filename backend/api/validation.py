from __future__ import annotations

import re

NAME_MAX = 60
NOTES_MAX = 280
_CONTROL_OR_ANGLE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]")


def normalize_name(raw: str) -> str:
    return " ".join(raw.split())


def is_valid_person_name(name: str) -> bool:
    """Mínimo nombre y apellido; cada palabra solo letras unidas por ' o -."""
    words = name.split(" ")
    if len(words) < 2:
        return False
    return all(part.isalpha() for w in words for part in re.split(r"['-]", w))


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value)


def sanitize_text(value: str, max_len: int) -> str:
    return _CONTROL_OR_ANGLE.sub("", value)[:max_len]
