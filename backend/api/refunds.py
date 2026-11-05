from __future__ import annotations


def is_void_cash_sale(original_payment: str, recharged_at) -> bool:
    """El efectivo reembolsado deja de ser venta hasta que se cobra con tarjeta."""
    return original_payment == "efectivo" and recharged_at is None


def refund_refusal(
    payment: str,
    order_branch: str | None,
    caja: str,
    total_cents: int,
    has_invoice_files: bool,
    has_note: bool,
) -> str | None:
    if payment == "pendiente":
        return "Esta orden no está cobrada."
    if payment not in ("efectivo", "tarjeta"):
        return "Esta orden no se puede reembolsar."
    if order_branch != caja:
        return "La orden es de otra sucursal."
    if total_cents <= 0:
        return "La orden no tiene monto por reembolsar."
    if not has_note:
        return "Esta orden no tiene nota."
    if payment == "efectivo" and has_invoice_files:
        return "Esta orden ya tiene PDF o XML de factura."
    return None
