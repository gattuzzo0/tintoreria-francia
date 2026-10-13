/** Ventana de entrega permitida: de mañana a 15 días después (mismo rango que valida create_order). */
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

export function deliveryWindow(today = new Date()): { min: string; max: string } {
  return { min: toIsoDate(addDays(today, 1)), max: toIsoDate(addDays(today, DELIVERY_MAX_DAYS)) };
}

export function isInDeliveryWindow(iso: string, today = new Date()): boolean {
  const { min, max } = deliveryWindow(today);
  return iso >= min && iso <= max;
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
