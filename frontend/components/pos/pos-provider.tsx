"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiHttpError } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { readBranch } from "@/lib/branches";
import { addOrderNote, advanceOrderStatus, createCustomer, createOrder, fetchCustomers, fetchOrders, fetchServices } from "@/lib/pos-api";
import {
  computeTotals,
  type Customer,
  type Order,
  type OrderLine,
  type OrderStatus,
  type PaymentMethod,
  type Service,
} from "@/lib/pos-data";
import { NOTES_MAX, sanitizeText } from "@/lib/validation";

export type Draft = {
  quantities: Record<string, number>;
  customerId: string | null;
  /** null hasta que el empleado elige Regular o Exprés. */
  express: boolean | null;
  /** YYYY-MM-DD; vacío hasta que el empleado elige en el calendario. */
  deliveryDate: string;
  payment: PaymentMethod;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  quantities: {},
  customerId: null,
  express: null,
  deliveryDate: "",
  payment: "tarjeta",
  notes: "",
};

type PosContextValue = {
  status: "loading" | "ready" | "error";
  loadError: string | null;
  reload: () => Promise<void>;
  draft: Draft;
  draftLines: OrderLine[];
  draftTotals: ReturnType<typeof computeTotals>;
  services: Service[];
  orders: Order[];
  customers: Customer[];
  addItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  clearDraft: () => void;
  checkout: () => Promise<Order | null>;
  advanceOrder: (folio: number, status: OrderStatus) => Promise<void>;
  addNote: (folio: number, body: string) => Promise<void>;
  addCustomer: (data: { name: string; phone: string }) => Promise<Customer>;
  getCustomer: (id: string) => Customer | undefined;
  setServices: (services: Service[]) => void;
  /** Ejecuta una llamada a la API; ante 401 refresca la sesión una vez y reintenta. */
  withAuth: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
};

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [status, setStatus] = useState<PosContextValue["status"]>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [services, setServicesState] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const withAuth = useCallback(
    async <T,>(call: (accessToken: string) => Promise<T>): Promise<T> => {
      try {
        return await call(token);
      } catch (err) {
        if (!(err instanceof ApiHttpError && err.status === 401)) throw err;
        const { data } = await supabase.auth.refreshSession();
        if (!data.session) throw err;
        return call(data.session.access_token);
      }
    },
    [token],
  );

  const fetchAll = useCallback(
    () => withAuth((t) => Promise.all([fetchServices(t), fetchCustomers(t), fetchOrders(t)])),
    [withAuth],
  );

  const applyData = useCallback(([s, c, o]: [Service[], Customer[], Order[]]) => {
    setServicesState(s);
    setCustomers(c);
    setOrders(o);
    setLoadError(null);
    setStatus("ready");
  }, []);

  const applyError = useCallback((e: unknown) => {
    setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
    setStatus("error");
  }, []);

  const reload = useCallback(async () => {
    setStatus("loading");
    await fetchAll().then(applyData, applyError);
  }, [fetchAll, applyData, applyError]);

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) fetchAll().then(applyData, applyError);
    // Solo al cambiar de usuario: cada refresh de token cambia `fetchAll` y no debe recargar los datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const draftLines = useMemo(
    () =>
      services.flatMap((s): OrderLine[] => {
        const qty = draft.quantities[s.id] ?? 0;
        return qty > 0 ? [{ serviceId: s.id, name: s.name, unit: s.unit, unitPriceCents: s.priceCents, qty }] : [];
      }),
    [services, draft.quantities],
  );
  const draftTotals = useMemo(() => computeTotals(draftLines, draft.express === true), [draftLines, draft.express]);

  const setQty = useCallback((id: string, qty: number) => {
    setDraft((d) => {
      const quantities = { ...d.quantities };
      if (qty <= 0) delete quantities[id];
      else quantities[id] = Math.min(999, Math.floor(qty));
      return { ...d, quantities };
    });
  }, []);

  const addItem = useCallback((id: string) => {
    setDraft((d) => ({
      ...d,
      quantities: { ...d.quantities, [id]: Math.min(999, (d.quantities[id] ?? 0) + 1) },
    }));
  }, []);

  const updateDraft = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);

  const clearDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  const checkout = useCallback(async (): Promise<Order | null> => {
    if (!draft.customerId || draftLines.length === 0 || draft.express === null || !draft.deliveryDate) return null;
    const branch = readBranch();
    if (!branch) throw new Error("Elige una sucursal al iniciar sesión.");
    const body = {
      customerId: draft.customerId,
      express: draft.express,
      deliveryDate: draft.deliveryDate,
      payment: draft.payment,
      branch,
      notes: sanitizeText(draft.notes, NOTES_MAX).trim(),
      lines: draftLines.map((l) => ({ serviceId: l.serviceId, qty: l.qty })),
    };
    const key = idempotencyKey.current;
    const order = await withAuth((t) => createOrder(t, body, key));
    setOrders((prev) => [order, ...prev.filter((o) => o.folio !== order.folio)]);
    clearDraft();
    return order;
  }, [withAuth, draft, draftLines, clearDraft]);

  const advanceOrder = useCallback(
    async (folio: number, next: OrderStatus) => {
      const updated = await withAuth((t) => advanceOrderStatus(t, folio, next));
      setOrders((prev) => prev.map((o) => (o.folio === folio ? updated : o)));
    },
    [withAuth],
  );

  const addNote = useCallback(
    async (folio: number, body: string) => {
      const updated = await withAuth((t) => addOrderNote(t, folio, body));
      setOrders((prev) => prev.map((o) => (o.folio === folio ? updated : o)));
    },
    [withAuth],
  );

  const addCustomer = useCallback(
    async (data: { name: string; phone: string }) => {
      const customer = await withAuth((t) => createCustomer(t, data));
      setCustomers((prev) => [customer, ...prev]);
      return customer;
    },
    [withAuth],
  );

  const getCustomer = useCallback((id: string) => customers.find((c) => c.id === id), [customers]);

  const setServices = useCallback((next: Service[]) => setServicesState(next.filter((s) => s.active)), []);

  const value = useMemo(
    () => ({
      status,
      loadError,
      reload,
      draft,
      draftLines,
      draftTotals,
      services,
      orders,
      customers,
      addItem,
      setQty,
      updateDraft,
      clearDraft,
      checkout,
      advanceOrder,
      addNote,
      addCustomer,
      getCustomer,
      setServices,
      withAuth,
    }),
    [withAuth, status, loadError, reload, draft, draftLines, draftTotals, services, orders, customers, addItem, setQty, updateDraft, clearDraft, checkout, advanceOrder, addNote, addCustomer, getCustomer, setServices],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos debe usarse dentro de <PosProvider>");
  return ctx;
}
