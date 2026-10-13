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

export const sanitizePhoneInput = (value: string) => digitsOnly(value).slice(0, PHONE_DIGITS);

export function sanitizeText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, "").slice(0, max);
}

export const formatPhone = (d: string) => `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6, 10)}`;

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
  return { ok: true, name, phone: formatPhone(digits) };
}
