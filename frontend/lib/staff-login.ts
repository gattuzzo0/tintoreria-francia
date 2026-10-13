import { PHONE_DIGITS } from "./validation";

/** Debe coincidir con STAFF_LOGIN_DOMAIN en backend/api/config.py. */
export const STAFF_LOGIN_DOMAIN = "usuarios.tintoreriafrancia.local";

export const isValidStaffPhone = (phone: string) => new RegExp(`^[0-9]{${PHONE_DIGITS}}$`).test(phone);

/** Supabase Auth guarda al personal como correo técnico; el usuario solo ve su teléfono. */
export const staffPhoneToLoginEmail = (phone: string) => `${phone}@${STAFF_LOGIN_DOMAIN}`;

export function staffPhoneFromLoginEmail(email: string | null): string | null {
  const [local, domain] = (email ?? "").split("@");
  return domain === STAFF_LOGIN_DOMAIN && isValidStaffPhone(local) ? local : null;
}
