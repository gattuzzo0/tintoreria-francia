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


# Misma expresión en frontend/lib/validation.ts (parseRfc).
_RFC = re.compile(r"^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$")
PAID_METHODS = ("efectivo", "tarjeta")


def normalize_rfc(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = "".join(raw.split()).upper()
    if not value:
        return None
    if _RFC.fullmatch(value) is None:
        raise ValueError("RFC inválido. 12 o 13 caracteres.")
    return value


# Catálogo CFDI 4.0 vigente (c_RegimenFiscal y c_UsoCFDI). Mismo listado en frontend/lib/fiscal.ts.
TAX_REGIMES = frozenset({
    "601", "603", "605", "606", "607", "608", "610", "611", "612", "614", "615", "616",
    "620", "621", "622", "623", "624", "625", "626",
})
CFDI_USES = frozenset({
    "G01", "G02", "G03", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08",
    "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10",
    "S01", "CP01", "CN01",
})
_LEGAL_NAME = re.compile(r"^(?=.*\w)[\w .,&'/-]{1,254}$", re.UNICODE)


def normalize_legal_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = " ".join(raw.split()).upper()
    if not value:
        return None
    if "_" in value or _LEGAL_NAME.fullmatch(value) is None:
        raise ValueError("Revisa el nombre o la razón social.")
    return value


def normalize_fiscal_zip(raw: str | None) -> str | None:
    if raw is None:
        return None
    digits = digits_only(raw)
    if not digits:
        return None
    if len(digits) != 5:
        raise ValueError("El código postal debe tener 5 dígitos.")
    return digits


def normalize_tax_regime(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    if value not in TAX_REGIMES:
        raise ValueError("Régimen fiscal inválido.")
    return value


def normalize_cfdi_use(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip().upper()
    if not value:
        return None
    if value not in CFDI_USES:
        raise ValueError("Uso del CFDI inválido.")
    return value


def invoice_on_create(payment: str, wants_invoice: bool) -> bool:
    """«Al recoger» no marca la orden. Se pregunta cuando el dinero entra."""
    return bool(wants_invoice) and payment != "pendiente"


def delivery_patch(
    current_payment: str,
    new_status: str,
    payment: str | None,
    wants_invoice: bool,
) -> dict[str, object]:
    """Solo al entregar una orden pendiente se cobra y se guarda la marca."""
    patch: dict[str, object] = {"status": new_status}
    if new_status != "entregado" or current_payment != "pendiente":
        return patch
    if payment not in PAID_METHODS:
        raise ValueError("Elige efectivo o tarjeta.")
    patch["payment_method"] = payment
    patch["wants_invoice"] = bool(wants_invoice)
    return patch


def sanitize_text(value: str, max_len: int) -> str:
    return _CONTROL_OR_ANGLE.sub("", value)[:max_len]
