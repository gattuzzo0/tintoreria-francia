"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, CircleAlert, MessageCircle, Search, StickyNote, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBranchInfo } from "@/lib/branches";
import { formatDeliveryShort } from "@/lib/delivery";
import { formatDate, formatMoney, PAYMENT_LABEL, STATUS_META, type OrderStatus } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { readyMessage, whatsappSendUrl } from "@/lib/whatsapp";
import { GarmentColorMark } from "./color-revolver";
import { OrderNotesDialog } from "./order-notes-dialog";
import { usePos } from "./pos-provider";

const COLUMNS: OrderStatus[] = ["recibido", "proceso", "listo", "entregado"];
const FOLIO_MAX_DIGITS = 9;
/** Tailwind `md` — autofocus del buscador solo en desktop. */
const DESKTOP_MQ = "(min-width: 768px)";

export function OrdersBoard() {
  const { orders, getCustomer, advanceOrder } = usePos();
  const searchRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<{ folio: number; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notesFolio, setNotesFolio] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia(DESKTOP_MQ).matches) {
      searchRef.current?.focus();
    }
  }, []);
  const notesOrder = orders.find((o) => o.folio === notesFolio) ?? null;
  const toggle = (folio: number) => setExpanded((f) => (f === folio ? null : folio));
  const visible = query ? orders.filter((o) => String(o.folio).includes(query)) : orders;
  const active = orders.filter((o) => o.status !== "entregado").length;
  const receivable = orders.filter((o) => o.payment === "pendiente").reduce((s, o) => s + o.totalCents, 0);

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

  return (
    <section className="flex flex-col gap-6" aria-labelledby="orders-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Flujo de trabajo</p>
          <h1 id="orders-title" className="text-2xl font-semibold tracking-tight">
            Órdenes
          </h1>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            inputMode="numeric"
            aria-label="Buscar número de orden"
            placeholder="Número de orden…"
            maxLength={FOLIO_MAX_DIGITS}
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/\D/g, "").slice(0, FOLIO_MAX_DIGITS))}
            className="h-10 w-full rounded-xl border border-input bg-background pr-3 pl-9 font-mono text-base tracking-wider sm:text-sm placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => {
          const list = visible.filter((o) => o.status === status);
          return (
            <section key={status} aria-labelledby={`col-${status}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-muted/50 p-3">
              <div className="flex items-center justify-between px-1">
                <h2 id={`col-${status}`} className="text-sm font-medium">
                  {STATUS_META[status].label}
                </h2>
                <span className="font-mono text-xs text-muted-foreground">{String(list.length).padStart(2, "0")}</span>
              </div>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Sin órdenes</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {list.map((o) => {
                    const meta = STATUS_META[o.status];
                    const customer = getCustomer(o.customerId);
                    const pieces = o.lines.reduce((n, l) => n + l.qty, 0);
                    const isOpen = expanded === o.folio;
                    const receivedBg =
                      o.status !== "recibido"
                        ? null
                        : o.branch === "Nereo Rdz."
                          ? "bg-red-200"
                          : o.branch === "Centro"
                            ? "bg-pink-200"
                            : null;
                    return (
                      <li
                        key={o.folio}
                        onClick={() => toggle(o.folio)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3.5 transition-colors hover:border-primary/40",
                          receivedBg ?? (o.status === "entregado" ? "border-dashed bg-muted/40" : "bg-card"),
                          isOpen && "border-primary/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">#{o.folio}</span>
                          {o.branch && (
                            <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              {o.branch}
                            </span>
                          )}
                          {o.express && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                              <Zap className="size-3" aria-hidden /> Exprés
                            </span>
                          )}
                          {(o.notes || o.staffNotes.length > 0) && (
                            <button
                              type="button"
                              aria-label={`Ver notas de la orden ${o.folio}`}
                              title="Ver notas"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotesFolio(o.folio);
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-full bg-warning md:size-6 text-warning-foreground outline-none hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/30"
                            >
                              <CircleAlert className="size-4" aria-hidden />
                            </button>
                          )}
                          <span
                            title={`Recibida ${formatDate(o.createdAt)}`}
                            className="ml-auto font-mono text-[11px] text-muted-foreground"
                          >
                            Entrega {formatDeliveryShort(o.deliveryDate)}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`order-lines-${o.folio}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(o.folio);
                          }}
                          className="mt-2 block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                        >
                          <span className="block text-sm font-medium">{customer?.name ?? "—"}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="truncate">
                              {pieces} prendas{isOpen ? "" : ` · ${o.lines.map((l) => l.name).join(", ")}`}
                            </span>
                            <ChevronDown
                              className={cn("ml-auto size-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
                              aria-hidden
                            />
                          </span>
                        </button>
                        {isOpen && (
                          <ul id={`order-lines-${o.folio}`} className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5 text-xs">
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
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                          <span className="font-mono text-sm">{formatMoney(o.totalCents)}</span>
                          <span
                            className={cn(
                              "font-mono text-[10px] uppercase tracking-[0.12em]",
                              o.payment === "pendiente" ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {PAYMENT_LABEL[o.payment]}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotesFolio(o.folio);
                            }}
                          >
                            <StickyNote aria-hidden /> Notas
                          </Button>
                          {o.status === "listo" && (
                            <Button
                              size="sm"
                              variant="outline"
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
                            >
                              <MessageCircle aria-hidden /> WhatsApp
                            </Button>
                          )}
                          {meta.next && (
                            <Button
                              size="sm"
                              variant={o.status === "listo" ? "default" : "outline"}
                              disabled={pending === o.folio}
                              onClick={(e) => {
                                e.stopPropagation();
                                void advance(o.folio, meta.next!);
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
              )}
            </section>
          );
        })}
      </div>
      <OrderNotesDialog order={notesOrder} onClose={() => setNotesFolio(null)} />
    </section>
  );
}
