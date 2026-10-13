import { apiFetch } from "./api-client";

export type StaffRole = "admin" | "empleado";

export type Admin = { userId: string; phone: string | null; role: StaffRole; createdAt: string };

export const fetchAdmins = (token: string) => apiFetch<Admin[]>("/api/admins", token);

export const createAdmin = (token: string, body: { phone: string; password: string; role: StaffRole }) =>
  apiFetch<Admin>("/api/admins", token, { method: "POST", body });

export const revokeStaff = (token: string, userId: string) =>
  apiFetch<void>(`/api/admins/${encodeURIComponent(userId)}`, token, { method: "DELETE" });
