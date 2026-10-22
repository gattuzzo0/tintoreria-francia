"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, CircleAlert, CircleX, Loader2, Search, StickyNote, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBranchInfo, readBranch } from "@/lib/branches";
import { formatDeliveryShort } from "@/lib/delivery";
import { fetchOrder } from "@/lib/pos-api";
import { formatDate, formatDateTime, formatMoney, formatShortDate, PAYMENT_LABEL, STATUS_META, type Customer, type DeliveredOrder, type Order, type OrderStatus } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { readyMessage, whatsappSendUrl } from "@/lib/whatsapp";
import { GarmentColorMark } from "./color-revolver";
import { OrderNotesDialog } from "./order-notes-dialog";
import { OrderPhoto } from "./order-photo";
import { usePos } from "./pos-provider";

const COLUMNS: OrderStatus[] = ["recibido", "proceso", "listo", "entregado"];
const FOLIO_MAX_DIGITS = 9;
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
/** Tailwind `md` — autofocus del buscador solo en desktop. */
const DESKTOP_MQ = "(min-width: 768px)";

export function OrdersBoard() {
  const { orders: allOrders, delivered: allDelivered, getCustomer, advanceOrder } = usePos();
  const openBranch = readBranch();
  const orders = allOrders.filter((o) => o.branch === openBranch);
  const delivered = allDelivered.filter((o) => o.branch === openBranch);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<{ folio: number; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<OrderStatus>("recibido");
  const [sweep, setSweep] = useState<{ from: OrderStatus; dir: 1 | -1; key: number } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notesFolio, setNotesFolio] = useState<number | null>(null);

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
  const notesOrder = orders.find((o) => o.folio === notesFolio) ?? null;
  const toggle = (folio: number) => setExpanded((f) => (f === folio ? null : folio));
  const visible = query ? orders.filter((o) => String(o.folio).includes(query)) : orders;
  const deliveredVisible = query ? delivered.filter((o) => String(o.folio).includes(query)) : delivered;
  const noMatch =
    query.length > 0 && (page === "entregado" ? deliveredVisible.length === 0 : !visible.some((o) => o.status === page));
  const active = orders.filter((o) => o.status !== "entregado").length;
  const receivable =
    orders.filter((o) => o.payment === "pendiente").reduce((s, o) => s + o.totalCents, 0) +
    delivered.filter((o) => o.payment === "pendiente").reduce((s, o) => s + o.totalCents, 0);

  const advance = async (folio: number, next: OrderStatus) => {
    setPending(folio);
    setError(null);
    try {
      await advanceOrder(folio, next);
    } catch (err) {
      setError({ folio, message: err instanceof Error ? err.message : "No se pudo actualizar la orden." });
    } finally {
      setPending(null);
    }
  };

  const showPage = (next: OrderStatus) => {
    if (next === page) return;
    const dir = COLUMNS.indexOf(next) > COLUMNS.indexOf(page) ? 1 : -1;
    setSweep((prev) => ({ from: page, dir, key: (prev?.key ?? 0) + 1 }));
    setPage(next);
    setExpanded(null);
  };

  const pageProps = {
    orders: visible,
    query,
    expanded,
    pending,
    error,
    getCustomer,
    onToggle: toggle,
    onNotes: setNotesFolio,
    onAdvance: (folio: number, next: OrderStatus) => void advance(folio, next),
  };

  return (
    <section className="flex flex-col gap-6" aria-label="Órdenes">
      <div role="tablist" aria-label="Estado de las órdenes" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLUMNS.map((status) => {
          const count = status === "entregado" ? delivered.length : orders.filter((o) => o.status === status).length;
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
            <dd className="text-lg">{formatMoney(receivable)}</dd>
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
            style={{ "--sweep": sweep.dir }}
          >
            {sweep.from === "entregado" ? (
              <DeliveredList rows={deliveredVisible} query={query} live={false} getCustomer={getCustomer} />
            ) : (
              <OrderPage status={sweep.from} live={false} {...pageProps} />
            )}
          </div>
        )}
        <div
          id="orders-panel"
          role="tabpanel"
          aria-labelledby={`orders-tab-${page}`}
          key={page}
          className={cn(sweep && "orders-sweep-in")}
          style={sweep ? { "--sweep": sweep.dir } : undefined}
        >
          {page === "entregado" ? (
            <DeliveredList rows={deliveredVisible} query={query} live getCustomer={getCustomer} />
          ) : (
            <OrderPage status={page} live {...pageProps} />
          )}
        </div>
      </div>
      <OrderNotesDialog order={notesOrder} onClose={() => setNotesFolio(null)} />
    </section>
  );
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
                                onAdvance(o.folio, meta.next!);
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
                  <span className="truncate text-sm">{getCustomer(row.customerId)?.name ?? "—"}</span>
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
