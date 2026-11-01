from __future__ import annotations

import uuid
from typing import Literal

InvoiceKind = Literal["pdf", "xml"]
KINDS: tuple[InvoiceKind, ...] = ("pdf", "xml")
MAX_BYTES = 4_000_000
CONTENT_TYPE: dict[str, str] = {"pdf": "application/pdf", "xml": "application/xml"}
COLUMN: dict[str, str] = {"pdf": "invoice_pdf_key", "xml": "invoice_xml_key"}


def invoice_object_key(folio: int, file_id: str, kind: str) -> str:
    if kind not in KINDS or folio < 1:
        raise ValueError("tipo inválido")
    parsed = uuid.UUID(file_id)
    ext = "pdf" if kind == "pdf" else "xml"
    return f"invoices/{folio}/{parsed}.{ext}"


def sniff_invoice(kind: str, blob: bytes) -> bool:
    if kind == "pdf":
        return blob.startswith(b"%PDF")
    text = blob.lstrip(b"\xef\xbb\xbf").lstrip(b" \t\r\n")
    return text.startswith(b"<?xml") or text.startswith(b"<cfdi:") or text.lower().startswith(b"<comprobante")
