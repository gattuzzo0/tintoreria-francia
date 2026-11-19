const FOLIO_MAX_DIGITS = 9;

/** Extrae el folio numérico de un QR de ticket (solo dígitos, o legado ORD-123). */
export function folioFromQrPayload(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length > FOLIO_MAX_DIGITS) return null;
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 1) return null;
  return String(n);
}

{
  if (folioFromQrPayload("1129") !== "1129") throw new Error("folio qr plain");
  if (folioFromQrPayload("ORD-1129") !== "1129") throw new Error("folio qr legacy");
  if (folioFromQrPayload("abc") !== null) throw new Error("folio qr junk");
}
