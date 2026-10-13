import { apiFetch } from "./api-client";
import type { Category, Customer, Order, OrderStatus, PaymentMethod, Service, Unit } from "./pos-data";

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
  notes: string;
  lines: { serviceId: string; qty: number }[];
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

export const fetchCustomers = (token: string) => apiFetch<Customer[]>("/api/customers", token);

export const createCustomer = (token: string, body: { name: string; phone: string }) =>
  apiFetch<Customer>("/api/customers", token, { method: "POST", body });

export const fetchOrders = (token: string) => apiFetch<Order[]>("/api/orders", token);

export const createOrder = (token: string, body: CreateOrderBody, idempotencyKey: string) =>
  apiFetch<Order>("/api/orders", token, { method: "POST", body, headers: { "Idempotency-Key": idempotencyKey } });

export const advanceOrderStatus = (token: string, folio: number, status: OrderStatus) =>
  apiFetch<Order>(`/api/orders/${folio}/status`, token, { method: "PATCH", body: { status } });

export const addOrderNote = (token: string, folio: number, body: string) =>
  apiFetch<Order>(`/api/orders/${folio}/notes`, token, { method: "POST", body: { body } });
