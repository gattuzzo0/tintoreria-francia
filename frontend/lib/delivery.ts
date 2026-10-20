/** Regular: +5 a +15. Exprés: hoy, mañana o +2. Domingo cerrado: esa fecha pasa al lunes. */
export const REGULAR_MIN_DAYS = 5;
export const DELIVERY_MAX_DAYS = 15;

/** YYYY-MM-DD → Date local a medianoche (sin desfase UTC). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isSunday(d: Date): boolean {
  return d.getDay() === 0;
}

/** Si cae en domingo, entrega al día siguiente. */
export function skipSunday(d: Date): Date {
  return isSunday(d) ? addDays(d, 1) : d;
}

export function daysFromToday(n: number, today = new Date()): string {
  return toIsoDate(addDays(today, n));
}

export function deliveryOn(days: number, today = new Date()): string {
  return toIsoDate(skipSunday(addDays(today, days)));
}

export function deliveryWindow(today = new Date()): { min: string; max: string } {
  const max = addDays(today, DELIVERY_MAX_DAYS);
  return {
    min: deliveryOn(REGULAR_MIN_DAYS, today),
    max: toIsoDate(isSunday(max) ? addDays(max, -1) : max),
  };
}

export function isAllowedDelivery(iso: string, express: boolean, today = new Date()): boolean {
  if (isSunday(parseIsoDate(iso))) return false;
  if (express) {
    return iso === deliveryOn(0, today) || iso === deliveryOn(1, today) || iso === deliveryOn(2, today);
  }
  const { min, max } = deliveryWindow(today);
  return iso >= min && iso <= max;
}

{
  const today = new Date(2026, 9, 20);
  const w = deliveryWindow(today);
  if (w.min !== "2026-10-26" || w.max !== "2026-11-04") throw new Error("deliveryWindow");
  if (isAllowedDelivery("2026-11-01", false, today)) throw new Error("sunday regular");
  if (!isAllowedDelivery("2026-10-20", true, today) || isAllowedDelivery("2026-10-23", true, today)) {
    throw new Error("isAllowedDelivery express");
  }
  const friday = new Date(2026, 9, 23);
  if (deliveryOn(2, friday) !== "2026-10-26" || isAllowedDelivery("2026-10-25", true, friday)) {
    throw new Error("express sunday");
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");

/** "Oct", "Sept" */
export const formatMonthShort = (d: Date) => cap(d.toLocaleDateString("es-MX", { month: "short" }));

/** "21 Oct", "30 Sept" — sin "de". */
export function formatDeliveryShort(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${formatMonthShort(d)}`;
}

/** "Mar 21 Oct" */
export function formatDeliveryLong(iso: string): string {
  return `${cap(parseIsoDate(iso).toLocaleDateString("es-MX", { weekday: "short" }))} ${formatDeliveryShort(iso)}`;
}
