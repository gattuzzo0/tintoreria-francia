"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiHttpError } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { readBranch } from "@/lib/branches";
import { lineKey, parseLineKey } from "@/lib/garment-colors";
import {
  addOrderNote,
  attachOrderPhoto,
  deleteOrderPhoto,
  uploadOrderPhoto,
  advanceOrderStatus,
  createCustomer,
  createOrder,
  fetchCustomers,
  fetchOrders,
  fetchServices,
} from "@/lib/pos-api";
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
  photoId: string | null;
};

const EMPTY_DRAFT: Draft = {
  quantities: {},
  customerId: null,
  express: null,
  deliveryDate: "",
  payment: "tarjeta",
  notes: "",
  photoId: null,
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
  addItem: (id: string, color: string) => void;
  setQty: (id: string, color: string, qty: number) => void;
  clearService: (id: string) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  clearDraft: () => void;
  checkout: () => Promise<Order | null>;
  advanceOrder: (folio: number, status: OrderStatus) => Promise<void>;
  addNote: (folio: number, body: string) => Promise<void>;
  addOrderPhoto: (folio: number, file: File) => Promise<void>;
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

  const draftLines = useMemo(() => {
    const lines: OrderLine[] = [];
    for (const [key, qty] of Object.entries(draft.quantities)) {
      const parsed = parseLineKey(key);
      if (!parsed || qty <= 0) continue;
      const service = services.find((s) => s.id === parsed.serviceId);
      if (!service) continue;
      lines.push({
        serviceId: service.id,
        name: service.name,
        unit: service.unit,
        unitPriceCents: service.priceCents,
        qty,
        color: parsed.color,
      });
    }
    return lines;
  }, [services, draft.quantities]);
  const draftTotals = useMemo(() => computeTotals(draftLines, draft.express === true), [draftLines, draft.express]);

  const setQty = useCallback((id: string, color: string, qty: number) => {
    const key = lineKey(id, color);
    setDraft((d) => {
      const quantities = { ...d.quantities };
      if (qty <= 0) delete quantities[key];
      else quantities[key] = Math.min(999, Math.floor(qty));
      return { ...d, quantities };
    });
  }, []);

  const clearService = useCallback((id: string) => {
    const prefix = `${id}\t`;
    setDraft((d) => {
      const quantities = { ...d.quantities };
      for (const key of Object.keys(quantities)) if (key.startsWith(prefix)) delete quantities[key];
      return { ...d, quantities };
    });
  }, []);

  const addItem = useCallback((id: string, color: string) => {
    const key = lineKey(id, color);
    setDraft((d) => ({
      ...d,
      quantities: { ...d.quantities, [key]: Math.min(999, (d.quantities[key] ?? 0) + 1) },
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
      ...(draft.photoId ? { photoId: draft.photoId } : {}),
      lines: draftLines.map((l) => ({ serviceId: l.serviceId, qty: l.qty, color: l.color })),
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

  const addOrderPhoto = useCallback(
    async (folio: number, file: File) => {
      const updated = await withAuth(async (t) => {
        const { id } = await uploadOrderPhoto(t, file);
        try {
          return await attachOrderPhoto(t, folio, id);
        } catch (err) {
          await deleteOrderPhoto(t, id).catch(() => {});
          throw err;
        }
      });
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
      clearService,
      updateDraft,
      clearDraft,
      checkout,
      advanceOrder,
      addNote,
      addOrderPhoto,
      addCustomer,
      getCustomer,
      setServices,
      withAuth,
    }),
    [withAuth, status, loadError, reload, draft, draftLines, draftTotals, services, orders, customers, addItem, setQty, clearService, updateDraft, clearDraft, checkout, advanceOrder, addNote, addOrderPhoto, addCustomer, getCustomer, setServices],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos debe usarse dentro de <PosProvider>");
  return ctx;
}
