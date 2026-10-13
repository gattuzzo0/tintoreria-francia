import { apiFetch } from "./api-client";
import type { PaymentMethod } from "./pos-data";

export type ReportSummary = {
  salesCents: number;
  orders: number;
  avgTicketCents: number;
  pieces: number;
  expressPct: number;
};

export type Report = {
  start: string;
  end: string;
  summary: ReportSummary;
  previous: ReportSummary;
  daily: { date: string; salesCents: number; orders: number }[];
  pending: {
    receivableCents: number;
    receivableOrders: number;
    readyOrders: number;
    readyPieces: number;
    aging: { label: string; orders: number; pieces: number }[];
    oldestReady: { folio: number; customerName: string; days: number; totalCents: number; payment: PaymentMethod }[];
  };
  services: { serviceId: string; name: string; category: string; qty: number; revenueCents: number }[];
  categories: { category: string; qty: number; revenueCents: number }[];
  payments: { method: PaymentMethod; orders: number; salesCents: number }[];
  customers: {
    newCount: number;
    returningCount: number;
    top: { customerId: string; name: string; orders: number; salesCents: number }[];
  };
  /** weekday: 0 = lunes … 6 = domingo (hora local del negocio). */
  peak: { weekday: number; hour: number; orders: number }[];
  cycle: {
    available: boolean;
    measured: number;
    readyHoursAvg: number | null;
    pickupHoursAvg: number | null;
    onTimePct: number | null;
  };
};

/** Fechas YYYY-MM-DD inclusivas. */
export const fetchReport = (token: string, start: string, end: string) =>
  apiFetch<Report>(`/api/reports?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, token);
