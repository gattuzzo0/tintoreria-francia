"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiHttpError } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { readBranch } from "@/lib/branches";
import { DEFAULT_RUSH_RATES, rushPct, type RushRates } from "@/lib/delivery";
import { lineKey, parseLineKey } from "@/lib/garment-colors";
import { clearOrdersCache } from "@/lib/orders-board-cache";
import { clearReportsCache } from "@/lib/reports-cache";
import {
  addOrderNote,
  attachOrderPhoto,
  deleteOrderPhoto,
  deleteOrderPhotos,
  uploadOrderPhoto,
  advanceOrderStatus,
  createCustomer,
  createOrder,
  updateCustomerFiscal,
  fetchCustomers,
  fetchDeliveryRates,
  fetchOrderSummary,
  fetchServices,
  type OrderSummary,
} from "@/lib/pos-api";
import {
  computeTotals,
  type Customer,
  type Order,
  type OrderLine,
  type OrderStatus,
  type PaidMethod,
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
  rushRates: RushRates;
  summary: OrderSummary;
  customers: Customer[];
  addItem: (id: string, color: string) => void;
  setQty: (id: string, color: string, qty: number) => void;
  clearService: (id: string) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  clearDraft: () => void;
  checkout: (wantsInvoice: boolean) => Promise<Order | null>;
  advanceOrder: (
    folio: number,
    status: OrderStatus,
    settle?: { payment: PaidMethod; wantsInvoice: boolean },
  ) => Promise<Order>;
  addNote: (folio: number, body: string) => Promise<Order>;
  addOrderPhoto: (folio: number, file: File) => Promise<Order>;
  clearOrderPhotos: (folio: number) => Promise<Order>;
  addCustomer: (data: { name: string; phone: string }) => Promise<Customer>;
  saveCustomerFiscal: (
    id: string,
    fiscal: {
      rfc?: string | null;
      legalName?: string | null;
      fiscalZip?: string | null;
      taxRegime?: string | null;
      cfdiUse?: string | null;
    },
  ) => Promise<Customer>;
  getCustomer: (id: string) => Customer | undefined;
  setServices: (services: Service[]) => void;
  setRushRates: (rates: RushRates) => void;
  refreshSummary: () => Promise<void>;
  patchSummary: (patch: (current: OrderSummary) => OrderSummary) => void;
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
  const [rushRates, setRushRatesState] = useState<RushRates>(DEFAULT_RUSH_RATES);
  const [summary, setSummary] = useState<OrderSummary>({
    recibido: 0,
    proceso: 0,
    listo: 0,
    entregado: 0,
    receivableCents: 0,
    nextFolio: 1001,
  });
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
    () =>
      withAuth((t) =>
        Promise.all([
          fetchServices(t),
          fetchCustomers(t),
          fetchDeliveryRates(t).catch(() => DEFAULT_RUSH_RATES),
        ]),
      ),
    [withAuth],
  );

  const applyData = useCallback(([s, c, rates]: [Service[], Customer[], RushRates]) => {
    setServicesState(s);
    setCustomers(c);
    setRushRatesState(rates);
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
  const draftTotals = useMemo(
    () => computeTotals(draftLines, draft.express && draft.deliveryDate ? rushPct(draft.deliveryDate, true, rushRates) : 0),
    [draftLines, draft.express, draft.deliveryDate, rushRates],
  );

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

  const checkout = useCallback(async (wantsInvoice: boolean): Promise<Order | null> => {
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
      wantsInvoice: wantsInvoice && draft.payment !== "pendiente",
      ...(draft.photoId ? { photoId: draft.photoId } : {}),
      lines: draftLines.map((l) => ({ serviceId: l.serviceId, qty: l.qty, color: l.color })),
    };
    const key = idempotencyKey.current;
    const order = await withAuth((t) => createOrder(t, body, key));
    clearOrdersCache();
    clearReportsCache();
    setSummary((current) => ({
      ...current,
      nextFolio: Math.max(current.nextFolio, order.folio + 1),
      recibido: current.recibido + 1,
      receivableCents: current.receivableCents + (order.payment === "pendiente" ? order.totalCents : 0),
    }));
    clearDraft();
    return order;
  }, [withAuth, draft, draftLines, clearDraft]);

  const advanceOrder = useCallback(
    async (folio: number, next: OrderStatus, settle?: { payment: PaidMethod; wantsInvoice: boolean }) => {
      const updated = await withAuth((t) => advanceOrderStatus(t, folio, next, settle));
      clearOrdersCache();
      clearReportsCache();
      return updated;
    },
    [withAuth],
  );

  const addNote = useCallback(
    async (folio: number, body: string) => {
      const updated = await withAuth((t) => addOrderNote(t, folio, body));
      clearOrdersCache();
      return updated;
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
      clearOrdersCache();
      return updated;
    },
    [withAuth],
  );

  const clearOrderPhotos = useCallback(
    async (folio: number) => {
      const updated = await withAuth((t) => deleteOrderPhotos(t, folio));
      clearOrdersCache();
      return updated;
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

  const saveCustomerFiscal = useCallback(
    async (
      id: string,
      fiscal: {
        rfc?: string | null;
        legalName?: string | null;
        fiscalZip?: string | null;
        taxRegime?: string | null;
        cfdiUse?: string | null;
      },
    ) => {
      const customer = await withAuth((t) => updateCustomerFiscal(t, id, fiscal));
      setCustomers((prev) => prev.map((c) => (c.id === id ? customer : c)));
      return customer;
    },
    [withAuth],
  );

  const getCustomer = useCallback((id: string) => customers.find((c) => c.id === id), [customers]);

  const setServices = useCallback((next: Service[]) => setServicesState(next.filter((s) => s.active)), []);
  const setRushRates = useCallback((next: RushRates) => setRushRatesState(next), []);
  const refreshSummary = useCallback(async () => {
    const branch = readBranch();
    if (!branch) return;
    setSummary(await withAuth((t) => fetchOrderSummary(t, branch)));
  }, [withAuth]);
  const patchSummary = useCallback((patch: (current: OrderSummary) => OrderSummary) => {
    setSummary(patch);
  }, []);

  const value = useMemo(
    () => ({
      status,
      loadError,
      reload,
      draft,
      draftLines,
      draftTotals,
      services,
      rushRates,
      summary,
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
      clearOrderPhotos,
      addCustomer,
      saveCustomerFiscal,
      getCustomer,
      setServices,
      setRushRates,
      refreshSummary,
      patchSummary,
      withAuth,
    }),
    [withAuth, status, loadError, reload, draft, draftLines, draftTotals, services, rushRates, summary, customers, addItem, setQty, clearService, updateDraft, clearDraft, checkout, advanceOrder, addNote, addOrderPhoto, clearOrderPhotos, addCustomer, saveCustomerFiscal, getCustomer, setServices, setRushRates, refreshSummary, patchSummary],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos debe usarse dentro de <PosProvider>");
  return ctx;
}
