export type Category = "Prendas" | "Trajes" | "Hogar" | "Especiales";
export type Unit = "pza" | "kg" | "par";

export type Service = {
  id: string;
  name: string;
  category: Category;
  unit: Unit;
  priceCents: number;
  imagePath: string | null;
  active: boolean;
};

export type Customer = { id: string; name: string; phone: string; email?: string | null };

export type OrderStatus = "recibido" | "proceso" | "listo" | "entregado";

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "pendiente";

export type OrderLine = {
  serviceId: string;
  name: string;
  unit: Unit;
  unitPriceCents: number;
  qty: number;
  /** Vacío en órdenes anteriores al color. */
  color: string;
};

export type OrderNote = { id: number; body: string; createdAt: string };

export type Order = {
  folio: number;
  customerId: string;
  lines: OrderLine[];
  express: boolean;
  /** YYYY-MM-DD */
  deliveryDate: string;
  payment: PaymentMethod;
  /** null en órdenes anteriores a la columna branch. */
  branch: string | null;
  status: OrderStatus;
  /** Observaciones capturadas al recibir la orden. */
  notes: string;
  /** Primera foto (recepción). null si no hay. */
  photoId?: string | null;
  /** Todas las fotos de la orden, la de recepción primero. */
  photoIds?: string[];
  /** Notas del staff durante el proceso, en orden de captura. */
  staffNotes: OrderNote[];
  createdAt: string;
  baseCents: number;
  surchargeCents: number;
  /** null en órdenes de antes de 000011: el ticket asume 30% si son exprés. */
  surchargePct?: number | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export const CATEGORIES: Category[] = ["Prendas", "Trajes", "Hogar", "Especiales"];
export const UNITS: Unit[] = ["pza", "kg", "par"];

export const TAX_RATE = 0.16;
/** Centavos enteros; misma fórmula que tintoreria_francia.recalc_order_totals (precios con IVA). */
export function computeTotals(lines: OrderLine[], surchargePct: number) {
  const base = lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
  const surcharge = Math.round((base * surchargePct) / 100);
  const total = base + surcharge;
  const subtotal = Math.round((total * 100) / 116);
  return { base, surcharge, subtotal, tax: total - subtotal, total };
}

export function orderSurchargePct(order: Pick<Order, "express" | "surchargePct" | "baseCents" | "surchargeCents">): number {
  if (!order.express) return 0;
  if (order.surchargePct != null) return order.surchargePct;
  if (!order.baseCents) return 0;
  return Math.round((order.surchargeCents * 100) / order.baseCents);
}

const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const formatMoney = (cents: number) => moneyFmt.format(cents / 100);

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const STATUS_META: Record<OrderStatus, { label: string; next?: OrderStatus; action?: string }> = {
  recibido: { label: "Recibido", next: "proceso", action: "Iniciar" },
  proceso: { label: "En proceso", next: "listo", action: "Marcar listo" },
  listo: { label: "Listo", next: "entregado", action: "Entregar" },
  entregado: { label: "Entregado" },
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  pendiente: "Paga al recoger",
};
