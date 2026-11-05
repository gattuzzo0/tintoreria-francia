import { ApiHttpError, apiFetch, apiUrl } from "./api-client";
import type { Branch } from "./branches";
import { prepareOrderPhoto } from "./prepare-order-photo";
import type { RushRates } from "./delivery";
import type { Category, Customer, DeliveredOrder, Order, OrderStatus, PaidMethod, PaymentMethod, Service, Unit } from "./pos-data";

export type Me = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "empleado" | null;
  canAccessPos: boolean;
  isAdmin: boolean;
};

export type CreateOrderBody = {
  customerId: string;
  express: boolean;
  deliveryDate: string;
  payment: PaymentMethod;
  branch: Branch;
  notes: string;
  photoId?: string;
  wantsInvoice?: boolean;
  lines: { serviceId: string; qty: number; color: string }[];
};

export type ServiceInput = { name: string; category: Category; unit: Unit; priceCents: number };

export const fetchMe = (token: string) => apiFetch<Me>("/api/me", token);

export const fetchServices = (token: string, includeInactive = false) =>
  apiFetch<Service[]>(`/api/catalog/services${includeInactive ? "?includeInactive=true" : ""}`, token);

export const createService = (token: string, body: ServiceInput) =>
  apiFetch<Service>("/api/catalog/services", token, { method: "POST", body });

export const updateService = (token: string, id: string, patch: Partial<ServiceInput & { active: boolean }>) =>
  apiFetch<Service>(`/api/catalog/services/${encodeURIComponent(id)}`, token, { method: "PATCH", body: patch });

export const deleteService = (token: string, id: string) =>
  apiFetch<void>(`/api/catalog/services/${encodeURIComponent(id)}`, token, { method: "DELETE" });

export const fetchDeliveryRates = (token: string) => apiFetch<RushRates>("/api/catalog/delivery-rates", token);

export const updateDeliveryRates = (token: string, body: RushRates) =>
  apiFetch<RushRates>("/api/catalog/delivery-rates", token, { method: "PATCH", body });

export const fetchCustomers = (token: string) => apiFetch<Customer[]>("/api/customers", token);

export const createCustomer = (token: string, body: { name: string; phone: string }) =>
  apiFetch<Customer>("/api/customers", token, { method: "POST", body });

export const updateCustomerFiscal = (
  token: string,
  customerId: string,
  body: {
    rfc?: string | null;
    legalName?: string | null;
    fiscalZip?: string | null;
    taxRegime?: string | null;
    cfdiUse?: string | null;
  },
) => apiFetch<Customer>(`/api/customers/${encodeURIComponent(customerId)}`, token, { method: "PATCH", body });

export type OrderBoard = { orders: Order[]; delivered: DeliveredOrder[]; hasMore: boolean };

export type OrderSummary = {
  recibido: number;
  proceso: number;
  listo: number;
  entregado: number;
  receivableCents: number;
  nextFolio: number;
  /** Órdenes por facturar a las que les falta el PDF o el XML. */
  incompleteInvoices: number;
};

export type CustomerStat = { customerId: string; orders: number; active: number; spentCents: number };

export const fetchOrderPage = (
  token: string,
  params: { status: OrderStatus; branch: string; before?: number; q?: string },
) => {
  const qs = new URLSearchParams({ status: params.status, branch: params.branch });
  if (params.before) qs.set("before", String(params.before));
  if (params.q) qs.set("q", params.q);
  return apiFetch<OrderBoard>(`/api/orders?${qs}`, token);
};

export const fetchOrderSummary = (token: string, branch: string) =>
  apiFetch<OrderSummary>(`/api/orders/summary?${new URLSearchParams({ branch })}`, token);

export const fetchCustomerStats = (token: string, branch: string) =>
  apiFetch<CustomerStat[]>(`/api/orders/stats?${new URLSearchParams({ branch })}`, token);

export type InvoiceOrder = {
  folio: number;
  customerName: string;
  phone: string;
  rfc: string | null;
  legalName: string | null;
  fiscalZip: string | null;
  taxRegime: string | null;
  cfdiUse: string | null;
  status: OrderStatus;
  payment: PaymentMethod;
  subtotalCents: number;
  taxCents: number;
  surchargeCents: number;
  totalCents: number;
  hasInvoicePdf: boolean;
  hasInvoiceXml: boolean;
  branch: string | null;
  createdAt: string;
};

export type ExpensePayment = "efectivo" | "tarjeta" | "transferencia";

export type Expense = {
  id: string;
  branch: Branch;
  spentOn: string;
  amountCents: number;
  concept: string;
  paymentMethod: ExpensePayment;
};

export type ExpenseInput = {
  spentOn: string;
  amountCents: number;
  concept: string;
  paymentMethod: ExpensePayment;
};

export const fetchExpenseMonths = (token: string, params: { branch: string; year: number }) =>
  apiFetch<number[]>(
    `/api/expenses/months?${new URLSearchParams({ branch: params.branch, year: String(params.year) })}`,
    token,
  );

export const fetchExpenses = (token: string, params: { branch: string; year: number; month: number }) =>
  apiFetch<Expense[]>(
    `/api/expenses?${new URLSearchParams({
      branch: params.branch,
      year: String(params.year),
      month: String(params.month),
    })}`,
    token,
  );

export const createExpense = (token: string, body: ExpenseInput & { branch: Branch }) =>
  apiFetch<Expense>("/api/expenses", token, { method: "POST", body });

export const updateExpense = (token: string, id: string, body: ExpenseInput) =>
  apiFetch<Expense>(`/api/expenses/${encodeURIComponent(id)}`, token, { method: "PATCH", body });

export const deleteExpense = (token: string, id: string) =>
  apiFetch<void>(`/api/expenses/${encodeURIComponent(id)}`, token, { method: "DELETE" });

export const fetchInvoiceOrders = (token: string, year: number, month: number) =>
  apiFetch<InvoiceOrder[]>(
    `/api/orders/invoices?${new URLSearchParams({ year: String(year), month: String(month) })}`,
    token,
  );

async function putSignedFile(url: string, body: Blob, contentType: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  } catch {
    throw new ApiHttpError("No se pudo subir el archivo.", 0);
  }
  if (!res.ok) throw new ApiHttpError("No se pudo subir el archivo.", res.status);
}

export async function uploadInvoiceFile(
  token: string,
  folio: number,
  kind: "pdf" | "xml",
  file: File,
): Promise<void> {
  const contentType = kind === "pdf" ? "application/pdf" : "application/xml";
  const presign = await apiFetch<{ fileId: string; key: string; putUrl: string }>(
    `/api/orders/${folio}/invoice-files/presign`,
    token,
    { method: "POST", body: { kind, byteSize: file.size } },
  );
  await putSignedFile(presign.putUrl, file, contentType);
  await apiFetch<void>(`/api/orders/${folio}/invoice-files`, token, {
    method: "POST",
    body: { kind, fileId: presign.fileId, key: presign.key },
  });
}

export async function openInvoiceFile(token: string, folio: number, kind: "pdf" | "xml"): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/api/orders/${folio}/invoice-files/${kind}`, token);
  window.open(url, "_blank", "noopener");
}

export const fetchOrder = (token: string, folio: number) => apiFetch<Order>(`/api/orders/${folio}`, token);

export type RefundRecord = {
  id: string;
  folio: number;
  branch: string;
  customerName: string;
  amountCents: number;
  originalPayment: "efectivo" | "tarjeta";
  recharged: boolean;
  createdAt: string;
};

export const createRefund = (token: string, folio: number, branch: string) =>
  apiFetch<RefundRecord>("/api/refunds", token, { method: "POST", body: { folio, branch } });

export const createOrder = (token: string, body: CreateOrderBody, idempotencyKey: string) =>
  apiFetch<Order>("/api/orders", token, { method: "POST", body, headers: { "Idempotency-Key": idempotencyKey } });

export const advanceOrderStatus = (
  token: string,
  folio: number,
  status: OrderStatus,
  settle?: { payment: PaidMethod; wantsInvoice: boolean },
) =>
  apiFetch<Order>(`/api/orders/${folio}/status`, token, {
    method: "PATCH",
    body: settle ? { status, payment: settle.payment, wantsInvoice: settle.wantsInvoice } : { status },
  });

export const addOrderNote = (token: string, folio: number, body: string) =>
  apiFetch<Order>(`/api/orders/${folio}/notes`, token, { method: "POST", body: { body } });

async function putSigned(url: string, body: Blob, contentType: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  } catch {
    throw new ApiHttpError("No se pudo subir la imagen.", 0);
  }
  if (!res.ok) throw new ApiHttpError("No se pudo subir la imagen.", res.status);
}

export function orderPhotoFileUrl(photoId: string, variant?: "thumb"): string {
  const query = variant === "thumb" ? "?v=thumb" : "";
  return apiUrl(`/api/orders/photos/${photoId}/file${query}`);
}

export async function uploadOrderPhoto(token: string, file: File): Promise<{ id: string }> {
  const prepared = await prepareOrderPhoto(file);
  const presign = await apiFetch<{ id: string; key: string; putUrl: string; thumbPutUrl: string }>(
    "/api/orders/photos/presign",
    token,
    { method: "POST", body: { contentType: prepared.mime } },
  );
  await Promise.all([
    putSigned(presign.putUrl, prepared.full, prepared.mime),
    ...(prepared.thumb ? [putSigned(presign.thumbPutUrl, prepared.thumb, "image/webp")] : []),
  ]);
  return apiFetch<{ id: string }>("/api/orders/photos", token, {
    method: "POST",
    body: {
      id: presign.id,
      key: presign.key,
      contentType: prepared.mime,
      byteSize: prepared.full.size,
      width: prepared.width,
      height: prepared.height,
    },
  });
}

export const deleteOrderPhoto = (token: string, photoId: string) =>
  apiFetch<void>(`/api/orders/photos/${photoId}`, token, { method: "DELETE" });

export const deleteOrderPhotos = (token: string, folio: number) =>
  apiFetch<Order>(`/api/orders/${folio}/photos`, token, { method: "DELETE" });

export const attachOrderPhoto = (token: string, folio: number, photoId: string) =>
  apiFetch<Order>(`/api/orders/${folio}/photos`, token, { method: "POST", body: { photoId } });
