"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronDown, CircleAlert, CircleX, Loader2, Search, StickyNote, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBranchInfo, readBranch } from "@/lib/branches";
import { formatDeliveryShort } from "@/lib/delivery";
import { ordersCacheKey, readOrdersCache, writeOrdersCache } from "@/lib/orders-board-cache";
import { fetchOrder, fetchOrderPage } from "@/lib/pos-api";
import { formatDate, formatDateTime, formatMoney, formatShortDate, PAYMENT_LABEL, STATUS_META, type Customer, type DeliveredOrder, type Order, type OrderStatus } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { readyMessage, whatsappSendUrl } from "@/lib/whatsapp";
import { GarmentColorMark } from "./color-revolver";
import { customerFiscal } from "./fiscal-form";
import { InvoiceDialog, type InvoiceResult } from "./invoice-dialog";
import { OrderNotesDialog } from "./order-notes-dialog";
import { OrderPhoto } from "./order-photo";
import { usePos } from "./pos-provider";

const COLUMNS: OrderStatus[] = ["recibido", "proceso", "listo", "entregado"];

function cachedPage(status: OrderStatus, q: string) {
  const branch = readBranch();
  if (!branch) return null;
  return readOrdersCache(ordersCacheKey(branch, status, q));
}
const FOLIO_MAX_DIGITS = 9;
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
/** Tailwind `md` — autofocus del buscador solo en desktop. */
const DESKTOP_MQ = "(min-width: 768px)";

export function OrdersBoard() {
  const { summary, getCustomer, advanceOrder, saveCustomerFiscal, withAuth, patchSummary } = usePos();
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const [pending, setPending] = useState<number | null>(null);
  const [settle, setSettle] = useState<Order | null>(null);
  const [error, setError] = useState<{ folio: number; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<OrderStatus>("recibido");
  const [sweep, setSweep] = useState<{
    from: OrderStatus;
    dir: 1 | -1;
    key: number;
    orders: Order[];
    delivered: DeliveredOrder[];
  } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notesFolio, setNotesFolio] = useState<number | null>(null);
  const [rows, setRows] = useState<Order[]>(() => cachedPage("recibido", "")?.orders ?? []);
  const [deliveredRows, setDeliveredRows] = useState<DeliveredOrder[]>(() => cachedPage("recibido", "")?.delivered ?? []);
  const [hasMore, setHasMore] = useState(() => cachedPage("recibido", "")?.hasMore ?? false);
  const [loading, setLoading] = useState(() => cachedPage("recibido", "") == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchKey = `${page}:${query}`;
  const [fetchedKey, setFetchedKey] = useState(fetchKey);
  if (fetchedKey !== fetchKey) {
    setFetchedKey(fetchKey);
    setLoadError(null);
    const hit = cachedPage(page, query);
    if (hit) {
      setRows(hit.orders);
      setDeliveredRows(hit.delivered);
      setHasMore(hit.hasMore);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!sweep) return;
    const timer = window.setTimeout(() => setSweep(null), 420);
    return () => window.clearTimeout(timer);
  }, [sweep]);

  useEffect(() => {
    if (window.matchMedia(DESKTOP_MQ).matches) {
      searchRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const branch = readBranch();
    const id = ++requestId.current;
    if (!branch) return;
    const key = ordersCacheKey(branch, page, query);
    if (readOrdersCache(key)) return;
    void withAuth((token) => fetchOrderPage(token, { status: page, branch, q: query || undefined }))
      .then((res) => {
        if (requestId.current !== id) return;
        const next = {
          orders: res.orders,
          delivered: res.delivered,
          hasMore: res.hasMore && res.orders.length + res.delivered.length > 0,
        };
        writeOrdersCache(key, next);
        setRows(next.orders);
        setDeliveredRows(next.delivered);
        setHasMore(next.hasMore);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setRows([]);
        setDeliveredRows([]);
        setHasMore(false);
        setLoadError(err instanceof Error ? err.message : "No se pudieron leer las órdenes.");
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [page, query, withAuth]);

  const loadMore = useCallback(() => {
    const branch = readBranch();
    if (!branch || !hasMore || loading || loadingMoreRef.current) return;
    const before = page === "entregado" ? deliveredRows.at(-1)?.folio : rows.at(-1)?.folio;
    if (!before) return;
    const id = requestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void withAuth((token) => fetchOrderPage(token, { status: page, branch, before, q: query || undefined }))
      .then((res) => {
        if (requestId.current !== id) return;
        const added = res.orders.length + res.delivered.length;
        const orders = mergeByFolio(rows, res.orders);
        const delivered = mergeByFolio(deliveredRows, res.delivered);
        const more = res.hasMore && added > 0;
        setRows(orders);
        setDeliveredRows(delivered);
        setHasMore(more);
        if (branch) writeOrdersCache(ordersCacheKey(branch, page, query), { orders, delivered, hasMore: more });
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setLoadError(err instanceof Error ? err.message : "No se pudieron leer más órdenes.");
      })
      .finally(() => {
        if (requestId.current === id) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      });
  }, [deliveredRows, hasMore, loading, page, query, rows, withAuth]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const notesOrder = rows.find((o) => o.folio === notesFolio) ?? null;
  const remember = (order: Order) => setRows((prev) => prev.map((o) => (o.folio === order.folio ? order : o)));
  const toggle = (folio: number) => setExpanded((f) => (f === folio ? null : folio));
  const noMatch = query.length > 0 && !loading && (page === "entregado" ? deliveredRows.length === 0 : rows.length === 0);
  const active = summary.recibido + summary.proceso + summary.listo;

  const completeDelivery = async (order: Order, result: InvoiceResult) => {
    if (!result.payment) throw new Error("Elige un método de pago.");
    setPending(order.folio);
    setError(null);
    try {
      await advanceOrder(order.folio, "entregado", { payment: result.payment, wantsInvoice: result.wantsInvoice });
      setRows((prev) => prev.filter((o) => o.folio !== order.folio));
      setSettle(null);
      patchSummary((current) => ({
        ...current,
        listo: Math.max(0, current.listo - 1),
        entregado: current.entregado + 1,
        receivableCents: Math.max(0, current.receivableCents - order.totalCents),
      }));
    } finally {
      setPending(null);
    }
  };

  const advance = async (folio: number, next: OrderStatus) => {
    setPending(folio);
    setError(null);
    try {
      await advanceOrder(folio, next);
      setRows((prev) => prev.filter((o) => o.folio !== folio));
      patchSummary((current) => ({ ...current, [page]: Math.max(0, current[page] - 1), [next]: current[next] + 1 }));
    } catch (err) {
      setError({ folio, message: err instanceof Error ? err.message : "No se pudo actualizar la orden." });
    } finally {
      setPending(null);
    }
  };

  const showPage = (next: OrderStatus) => {
    if (next === page) return;
    const dir = COLUMNS.indexOf(next) > COLUMNS.indexOf(page) ? 1 : -1;
    setSweep((prev) => ({ from: page, dir, key: (prev?.key ?? 0) + 1, orders: rows, delivered: deliveredRows }));
    setPage(next);
    setExpanded(null);
  };

  const pageProps = {
    orders: rows,
    query,
    expanded,
    pending,
    error,
    getCustomer,
    onToggle: toggle,
    onNotes: setNotesFolio,
    onAdvance: (folio: number, next: OrderStatus) => void advance(folio, next),
    onDeliver: (order: Order) => {
      if (order.payment === "pendiente") setSettle(order);
      else void advance(order.folio, "entregado");
    },
  };

  return (
    <section className="flex flex-col gap-6" aria-label="Órdenes">
      <div role="tablist" aria-label="Estado de las órdenes" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLUMNS.map((status) => {
          const count = summary[status];
          const selected = page === status;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              id={`orders-tab-${status}`}
              aria-selected={selected}
              aria-controls="orders-panel"
              onClick={() => showPage(status)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
                FOCUS,
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {STATUS_META[status].label}
              <span className={cn("font-mono text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:w-64">
          {noMatch ? (
            <CircleX className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-destructive" aria-hidden />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          )}
          <input
            ref={searchRef}
            type="search"
            inputMode="numeric"
            aria-label="Buscar número de orden"
            aria-invalid={noMatch || undefined}
            placeholder="Número de orden…"
            maxLength={FOLIO_MAX_DIGITS}
            value={query}
            onPointerDown={() => setQuery("")}
            onFocus={() => setQuery("")}
            onChange={(e) => setQuery(e.target.value.replace(/\D/g, "").slice(0, FOLIO_MAX_DIGITS))}
            className={cn(
              "h-10 w-full rounded-xl border bg-background pr-3 pl-9 font-mono text-base tracking-wider outline-none focus-visible:ring-3 sm:text-sm placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground",
              noMatch
                ? "border-destructive text-destructive focus-visible:ring-destructive/30"
                : "border-input focus-visible:ring-ring/30",
            )}
          />
        </div>
        <dl className="flex gap-8 font-mono">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Activas</dt>
            <dd className="text-lg">{active}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Por cobrar</dt>
            <dd className="text-lg">{formatMoney(summary.receivableCents)}</dd>
          </div>
        </dl>
      </div>

      <div className="relative overflow-hidden">
        {sweep && (
          <div
            key={sweep.key}
            aria-hidden
            inert
            className="orders-sweep-out pointer-events-none absolute inset-x-0 top-0"
            style={{ "--sweep": sweep.dir } as CSSProperties}
          >
            {sweep.from === "entregado" ? (
              <DeliveredList rows={sweep.delivered} query={query} live={false} getCustomer={getCustomer} />
            ) : (
              <OrderPage status={sweep.from} live={false} {...pageProps} orders={sweep.orders} />
            )}
          </div>
        )}
        <div
          id="orders-panel"
          role="tabpanel"
          aria-labelledby={`orders-tab-${page}`}
          key={page}
          className={cn(sweep && "orders-sweep-in")}
          style={sweep ? ({ "--sweep": sweep.dir } as CSSProperties) : undefined}
        >
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando órdenes…
            </p>
          ) : loadError ? (
            <p role="alert" className="rounded-xl border border-destructive bg-destructive/10 px-3 py-10 text-center text-sm text-destructive">
              {loadError}
            </p>
          ) : page === "entregado" ? (
            <DeliveredList rows={deliveredRows} query={query} live getCustomer={getCustomer} />
          ) : (
            <OrderPage status={page} live {...pageProps} />
          )}
        </div>
        {hasMore && !loading && <div ref={sentinelRef} className="h-px" aria-hidden />}
        {loadingMore && (
          <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando más órdenes…
          </p>
        )}
      </div>
      <OrderNotesDialog order={notesOrder} onClose={() => setNotesFolio(null)} onUpdated={remember} />
      <InvoiceDialog
        open={settle !== null}
        customerName={settle ? (getCustomer(settle.customerId)?.name ?? "Cliente") : ""}
        fiscal={settle ? customerFiscal(getCustomer(settle.customerId) ?? { rfc: null }) : customerFiscal({})}
        askPayment
        onAbort={() => setSettle(null)}
        onSaveFiscal={async (fiscal) => {
          if (!settle) return;
          await saveCustomerFiscal(settle.customerId, fiscal);
        }}
        onDone={async (result) => {
          if (!settle) return;
          await completeDelivery(settle, result);
        }}
      />
    </section>
  );
}

function InvoiceMark() {
  return (
    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
      Facturar
    </span>
  );
}

function mergeByFolio<T extends { folio: number }>(prev: T[], next: T[]) {
  const seen = new Set(prev.map((row) => row.folio));
  return [...prev, ...next.filter((row) => !seen.has(row.folio))];
}

function EmptyOrders({ query }: { query: string }) {
  if (!query) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">Sin órdenes</p>
    );
  }
  return (
    <p
      role="status"
      className="flex flex-col items-center gap-2 rounded-xl border border-destructive bg-destructive/10 px-3 py-10 text-center text-sm font-medium text-destructive"
    >
      <CircleX className="size-7" aria-hidden />
      Ninguna orden con ese número
    </p>
  );
}

function OrderPage({
  status,
  orders,
  query,
  expanded,
  pending,
  error,
  getCustomer,
  onToggle,
  onNotes,
  onAdvance,
  onDeliver,
  live,
  detailsOnly = false,
}: {
  status: OrderStatus;
  orders: Order[];
  query: string;
  expanded: number | null;
  pending: number | null;
  error: { folio: number; message: string } | null;
  getCustomer: (id: string) => Customer | undefined;
  onToggle: (folio: number) => void;
  onNotes: (folio: number) => void;
  onAdvance: (folio: number, next: OrderStatus) => void;
  onDeliver: (order: Order) => void;
  live: boolean;
  detailsOnly?: boolean;
}) {
  const list = orders.filter((o) => o.status === status);
  if (list.length === 0) return <EmptyOrders query={query} />;
  return (
    <ul className={cn("grid items-start gap-3", !detailsOnly && "md:grid-cols-2 xl:grid-cols-3")}>
      {list.map((o) => {
        const meta = STATUS_META[o.status];
        const customer = getCustomer(o.customerId);
        const pieces = o.lines.reduce((n, l) => n + l.qty, 0);
        const isOpen = detailsOnly || expanded === o.folio;
        const receivedBg =
          o.status !== "recibido" ? null : o.branch === "Nereo Rdz." ? "bg-red-200" : o.branch === "Centro" ? "bg-pink-200" : null;
        return (
          <li
            key={o.folio}
            onClick={detailsOnly ? undefined : () => onToggle(o.folio)}
            className={cn(
              !detailsOnly && "cursor-pointer rounded-xl border p-3.5 transition-colors hover:border-primary/40",
              !detailsOnly && (receivedBg ?? (o.status === "entregado" ? "border-dashed bg-muted/40" : "bg-card")),
              !detailsOnly && isOpen && "border-primary/40",
              detailsOnly && "border-t bg-muted/30 px-4 py-3",
            )}
          >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">#{o.folio}</span>
                          <span className="min-w-0 truncate text-sm font-medium">{customer?.name ?? "—"}</span>
                          {detailsOnly && (
                            <span className="shrink-0 font-mono text-xs text-foreground">
                              Tel. {customer?.phone || "sin registrar"}
                            </span>
                          )}
                          {o.express && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                              <Zap className="size-3" aria-hidden /> Exprés
                            </span>
                          )}
                          {o.wantsInvoice && <InvoiceMark />}
                          {(o.notes || o.photoId || (o.photoIds?.length ?? 0) > 0 || o.staffNotes.length > 0) && (
                            <button
                              type="button"
                              aria-label={`Ver notas de la orden ${o.folio}`}
                              title="Ver notas"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNotes(o.folio);
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-full bg-warning md:size-6 text-warning-foreground outline-none hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/30"
                            >
                              <CircleAlert className="size-4" aria-hidden />
                            </button>
                          )}
                          <span
                            title={detailsOnly ? undefined : `Recibida ${formatDate(o.createdAt)}`}
                            className="ml-auto text-right font-mono text-[11px] text-muted-foreground"
                          >
                            {detailsOnly ? (
                              <>
                                <span className={cn("block text-xs", o.payment === "pendiente" ? "text-destructive" : "text-foreground")}>
                                  {PAYMENT_LABEL[o.payment]}
                                </span>
                                <span className="block">
                                  Entregada {o.statusUpdatedAt ? formatDateTime(o.statusUpdatedAt) : "—"}
                                </span>
                              </>
                            ) : (
                              <>Entrega {formatDeliveryShort(o.deliveryDate)}</>
                            )}
                          </span>
                        </div>
                        {!detailsOnly && (
                        <div className="mt-2 flex items-end gap-2">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={live ? `order-lines-${o.folio}` : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggle(o.folio);
                            }}
                            className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                          >
                            <span className="block truncate text-xs text-muted-foreground">
                              {pieces} {pieces === 1 ? "prenda" : "prendas"}
                            </span>
                          </button>
                          {o.status === "listo" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNotes(o.folio);
                              }}
                            >
                              <StickyNote aria-hidden /> Notas
                            </Button>
                          )}
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Cerrar orden ${o.folio}` : `Abrir orden ${o.folio}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggle(o.folio);
                            }}
                            className="mb-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
                          >
                            <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden />
                          </button>
                        </div>
                        )}
                        {isOpen && (
                          <ul id={live ? `order-lines-${o.folio}` : undefined} className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5 text-xs">
                            {o.lines.map((l) => (
                              <li key={`${l.serviceId}:${l.color}`} className="flex items-baseline justify-between gap-3">
                                <span>
                                  <span className="font-mono">
                                    {l.qty} {l.unit}
                                  </span>{" "}
                                  · {l.name} <GarmentColorMark color={l.color} />
                                </span>
                                <span className="font-mono text-muted-foreground">{formatMoney(l.unitPriceCents * l.qty)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {o.notes && <p className="mt-1 text-xs text-muted-foreground italic">{o.notes}</p>}
                        {isOpen && (o.photoIds?.length ? o.photoIds : o.photoId ? [o.photoId] : []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(o.photoIds?.length ? o.photoIds : [o.photoId as string]).map((id) => (
                              <OrderPhoto key={id} photoId={id} className="h-20 w-20 rounded-lg object-cover" />
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                          {!detailsOnly && <span className="font-mono text-sm">{formatMoney(o.totalCents)}</span>}
                          {!detailsOnly && (
                            <span
                              className={cn(
                                "font-mono text-[10px] uppercase tracking-[0.12em]",
                                o.payment === "pendiente" ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {PAYMENT_LABEL[o.payment]}
                            </span>
                          )}
                          {o.status === "proceso" && meta.next && (
                            <label
                              className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-muted-foreground">Listo</span>
                              <span className="relative inline-flex items-center">
                                <input
                                  type="checkbox"
                                  role="switch"
                                  checked={pending === o.folio}
                                  disabled={pending === o.folio}
                                  aria-label={`Marcar la orden ${o.folio} como lista`}
                                  onChange={() => onAdvance(o.folio, meta.next!)}
                                  className="peer sr-only"
                                />
                                <span className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30 peer-disabled:opacity-50" />
                                <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5" />
                              </span>
                            </label>
                          )}
                          {o.status !== "listo" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(o.status !== "proceso" && "ml-auto")}
                              onClick={(e) => {
                                e.stopPropagation();
                                onNotes(o.folio);
                              }}
                            >
                              <StickyNote aria-hidden /> Notas
                            </Button>
                          )}
                          {o.status === "listo" && meta.next && (
                            <Button
                              size="sm"
                              className="ml-auto"
                              disabled={pending === o.folio}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeliver(o);
                              }}
                            >
                              {meta.action} <ArrowRight aria-hidden />
                            </Button>
                          )}
                          {o.status === "listo" && (
                            <button
                              type="button"
                              disabled={!customer?.phone}
                              title={customer?.phone ? "Avisar por WhatsApp" : "Sin teléfono"}
                              aria-label={`Avisar por WhatsApp que la orden ${o.folio} está lista`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!customer?.phone) return;
                                const branch = getBranchInfo(o.branch);
                                window.location.href = whatsappSendUrl(
                                  customer.phone,
                                  readyMessage(
                                    customer.name,
                                    o.folio,
                                    { branch: o.branch, hours: branch?.hours },
                                    o.payment === "pendiente" ? formatMoney(o.totalCents) : undefined,
                                  ),
                                );
                              }}
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#25D366] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-40"
                            >
                              <WhatsAppMark />
                            </button>
                          )}
                          {meta.next && o.status !== "listo" && o.status !== "proceso" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending === o.folio}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAdvance(o.folio, meta.next!);
                              }}
                            >
                              {meta.action} <ArrowRight aria-hidden />
                            </Button>
                          )}
                        </div>
                        {error?.folio === o.folio && (
                          <p role="alert" className="mt-2 text-xs text-destructive">
                            {error.message}
                          </p>
                        )}
          </li>
        );
      })}
    </ul>
  );
}

function DeliveredList({
  rows,
  query,
  live,
  getCustomer,
}: {
  rows: DeliveredOrder[];
  query: string;
  live: boolean;
  getCustomer: (id: string) => Customer | undefined;
}) {
  const { withAuth } = usePos();
  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Order>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<{ folio: number; message: string } | null>(null);
  const [notesOrder, setNotesOrder] = useState<Order | null>(null);

  const remember = (order: Order) => {
    setDetails((prev) => ({ ...prev, [order.folio]: order }));
    setNotesOrder((current) => (current?.folio === order.folio ? order : current));
  };

  const toggle = (folio: number) => {
    if (!live) return;
    if (open === folio) {
      setOpen(null);
      return;
    }
    setOpen(folio);
    if (details[folio]) return;
    setLoading(folio);
    setError(null);
    void withAuth((token) => fetchOrder(token, folio))
      .then(remember)
      .catch((err: unknown) => {
        setError({ folio, message: err instanceof Error ? err.message : "No se pudo leer la orden." });
      })
      .finally(() => setLoading((current) => (current === folio ? null : current)));
  };

  if (rows.length === 0) return <EmptyOrders query={query} />;

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_auto_1.5rem] gap-3 border-b px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>Orden</span>
          <span>Cliente</span>
          <span>Fecha</span>
          <span className="text-right">Monto</span>
          <span className="sr-only">Detalle</span>
        </div>
        <ul>
          {rows.map((row) => {
            const isOpen = open === row.folio;
            const detail = details[row.folio];
            return (
              <li key={row.folio} className="border-b last:border-b-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(row.folio)}
                  className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_auto_1.5rem] items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <span className="font-mono text-sm font-medium">#{row.folio}</span>
                  <span className="flex min-w-0 items-center gap-2 truncate text-sm">
                    <span className="truncate">{getCustomer(row.customerId)?.name ?? "—"}</span>
                    {row.wantsInvoice && <InvoiceMark />}
                  </span>
                  <span className="font-mono text-sm">{row.statusUpdatedAt ? formatShortDate(row.statusUpdatedAt) : "—"}</span>
                  <span
                    className={cn("text-right font-mono text-sm", row.payment === "pendiente" && "text-destructive")}
                    title={row.payment === "pendiente" ? "Paga al recoger" : undefined}
                  >
                    {formatMoney(row.totalCents)}
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen && loading === row.folio && !detail && (
                  <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…
                  </p>
                )}
                {isOpen && error?.folio === row.folio && !detail && (
                  <p role="alert" className="px-4 py-3 text-sm text-destructive">
                    {error.message}
                  </p>
                )}
                {isOpen && detail && (
                  <OrderPage
                    status="entregado"
                    orders={[detail]}
                    query=""
                    expanded={row.folio}
                    pending={null}
                    error={null}
                    getCustomer={getCustomer}
                    onToggle={() => {}}
                    onNotes={() => setNotesOrder(detail)}
                    onAdvance={() => {}}
                    onDeliver={() => {}}
                    live={live}
                    detailsOnly
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {live && <OrderNotesDialog order={notesOrder} onClose={() => setNotesOrder(null)} onUpdated={remember} />}
    </>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M20.5 3.5A11 11 0 0 0 2.1 17.2L1 23l5.9-1.1A11 11 0 0 0 12 23a11 11 0 0 0 8.5-19.5zM12 21a9 9 0 0 1-4.6-1.3l-.3-.2-3.4.6.7-3.3-.2-.3A9 9 0 1 1 12 21zm5-6.7c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.2-.3a.4.4 0 0 0 0-.4c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-1 2.3 5.3 5.3 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4.1c.6.3 1.1.4 1.6.5a3.8 3.8 0 0 0 1.7.1 2.8 2.8 0 0 0 1.9-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.2-.3-.2-.6-.3z" />
    </svg>
  );
}
