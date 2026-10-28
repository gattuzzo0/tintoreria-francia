export const NAME_MAX = 60;
export const PHONE_DIGITS = 10;
export const NOTES_MAX = 280;
export const SEARCH_MAX = 60;

const NAME_PATTERN = /^\p{L}+(?:['-]\p{L}+)*(?: \p{L}+(?:['-]\p{L}+)*)+$/u;

export function sanitizeNameInput(value: string): string {
  return value
    .replace(/[^\p{L}\s'-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .slice(0, NAME_MAX);
}

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

// Misma expresión en backend/api/validation.py (normalize_rfc).
const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export function parseRfc(raw: string): { ok: true; rfc: string | null } | { ok: false; error: string } {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  if (!value) return { ok: true, rfc: null };
  if (!RFC_PATTERN.test(value)) return { ok: false, error: "RFC inválido. 12 o 13 caracteres." };
  return { ok: true, rfc: value };
}

const LEGAL_NAME = /^(?=.*\p{L})[\p{L}\p{N} .,&'/-]{1,254}$/u;
const REGIME_CODES = new Set([
  "601", "603", "605", "606", "607", "608", "610", "611", "612", "614", "615", "616",
  "620", "621", "622", "623", "624", "625", "626",
]);
const CFDI_CODES = new Set([
  "G01", "G02", "G03", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08",
  "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10",
  "S01", "CP01", "CN01",
]);

export type FiscalValue = {
  rfc: string | null;
  legalName: string | null;
  fiscalZip: string | null;
  taxRegime: string | null;
  cfdiUse: string | null;
};

export function fiscalReady(value: FiscalValue): boolean {
  return Boolean(value.rfc && value.legalName && value.fiscalZip && value.taxRegime && value.cfdiUse);
}

export function parseFiscal(
  raw: { rfc: string; legalName: string; fiscalZip: string; taxRegime: string; cfdiUse: string },
  required: boolean,
): { ok: true; value: FiscalValue } | { ok: false; error: string } {
  const rfc = parseRfc(raw.rfc);
  if (!rfc.ok) return rfc;
  const legalName = raw.legalName.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-MX");
  const fiscalZip = digitsOnly(raw.fiscalZip);
  const taxRegime = raw.taxRegime.trim();
  const cfdiUse = raw.cfdiUse.trim().toUpperCase();

  if (legalName && (legalName.length > 254 || !LEGAL_NAME.test(legalName))) {
    return { ok: false, error: "Revisa el nombre o la razón social." };
  }
  if (fiscalZip && fiscalZip.length !== 5) return { ok: false, error: "El código postal debe tener 5 dígitos." };
  if (taxRegime && !REGIME_CODES.has(taxRegime)) return { ok: false, error: "Régimen fiscal inválido." };
  if (cfdiUse && !CFDI_CODES.has(cfdiUse)) return { ok: false, error: "Uso del CFDI inválido." };

  const value: FiscalValue = {
    rfc: rfc.rfc,
    legalName: legalName || null,
    fiscalZip: fiscalZip || null,
    taxRegime: taxRegime || null,
    cfdiUse: cfdiUse || null,
  };
  if (!required) return { ok: true, value };
  if (!value.rfc) return { ok: false, error: "Escribe el RFC." };
  if (!value.legalName) return { ok: false, error: "Escribe el nombre o la razón social." };
  if (!value.fiscalZip) return { ok: false, error: "Escribe el código postal del domicilio fiscal." };
  if (!value.taxRegime) return { ok: false, error: "Elige el régimen fiscal." };
  if (!value.cfdiUse) return { ok: false, error: "Elige el uso del CFDI." };
  return { ok: true, value };
}

export const sanitizePhoneInput = (value: string) => digitsOnly(value).slice(0, PHONE_DIGITS);

export function sanitizeText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, "").slice(0, max);
}

export type CustomerValidation =
  | { ok: true; name: string; phone: string }
  | { ok: false; errors: { name?: string; phone?: string } };

export function validateCustomer(
  rawName: string,
  rawPhone: string,
  existingPhones: string[],
): CustomerValidation {
  const name = rawName.trim().replace(/\s+/g, " ");
  const digits = digitsOnly(rawPhone);
  const errors: { name?: string; phone?: string } = {};

  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > NAME_MAX) errors.name = "Máximo 60 caracteres.";
  else if (!NAME_PATTERN.test(name)) errors.name = "Solo letras; escribe nombre y apellido.";

  if (!digits) errors.phone = "El teléfono es obligatorio.";
  else if (digits.length !== PHONE_DIGITS) errors.phone = "Debe tener exactamente 10 dígitos.";
  else if (existingPhones.some((p) => digitsOnly(p) === digits))
    errors.phone = "Ya existe un cliente con ese teléfono.";

  if (errors.name || errors.phone) return { ok: false, errors };
  return { ok: true, name, phone: digits };
}
