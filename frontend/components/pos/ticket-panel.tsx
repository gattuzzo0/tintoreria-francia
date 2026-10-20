"use client";

import { useState } from "react";
import { CalendarDays, Minus, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deliveryOn, formatDeliveryLong, formatDeliveryShort, isAllowedDelivery, REGULAR_MIN_DAYS } from "@/lib/delivery";
import { formatMoney, type Order } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { NOTES_MAX, sanitizeText } from "@/lib/validation";
import { GarmentColorMark } from "./color-revolver";
import { CheckoutConfirmDialog } from "./checkout-confirm-dialog";
import { CustomerLookup } from "./customer-lookup";
import { DeliveryDateDialog, ExpressDeliveryDialog } from "./delivery-date-dialog";
import { ReceiptDialog } from "./receipt-dialog";
import { usePos } from "./pos-provider";

const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

export function TicketPanel({
  onRegisterPhone,
  lookupKey = 0,
  onSaleComplete,
}: {
  onRegisterPhone: (phone: string) => void;
  lookupKey?: number;
  onSaleComplete?: () => void;
}) {
  const { draft, draftLines, draftTotals, orders, setQty, updateDraft, checkout, getCustomer } = usePos();
  const customer = draft.customerId ? getCustomer(draft.customerId) : undefined;

  const [receipt, setReceipt] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [pickingExpress, setPickingExpress] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const deliveryOk =
    draft.express !== null && Boolean(draft.deliveryDate) && isAllowedDelivery(draft.deliveryDate, draft.express);

  const chooseDelivery = (express: boolean) => {
    if (express) {
      updateDraft({ express: true });
      setPickingExpress(true);
      return;
    }
    updateDraft({ express: false, deliveryDate: deliveryOn(REGULAR_MIN_DAYS) });
  };

  const nextFolio = Math.max(1000, ...orders.map((o) => o.folio)) + 1;
  const pieces = draftLines.reduce((n, l) => n + l.qty, 0);

  const onCheckout = async () => {
    setCheckoutError(null);
    setBusy(true);
    try {
      const order = await checkout();
      if (!order) return;
      setConfirming(false);
      setReceipt(order);
      onSaleComplete?.();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "No se pudo registrar la orden.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Ticket actual"
      className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_20px_50px_-30px] shadow-foreground/25 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7.5rem)] lg:w-[400px] lg:shrink-0"
    >
      <div className="bg-primary text-primary-foreground">
        <div className="flex items-center justify-between px-5 py-3 short:py-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">Folio</p>
            <p className="font-mono text-xl tracking-wider">#{nextFolio}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">Prendas</p>
            <p className="font-mono text-xl tracking-wider">{String(pieces).padStart(2, "0")}</p>
          </div>
        </div>
        <div className="perforation h-2 bg-primary" aria-hidden />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-3.5 short:gap-2.5 short:py-3">
        <CustomerLookup key={lookupKey} onRegisterPhone={onRegisterPhone} autoFocus className="hidden shrink-0 lg:flex" />

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className={LABEL}>Prendas</h2>
            {draftLines.length > 0 && (
              <button
                type="button"
                onClick={() => updateDraft({ quantities: {} })}
                className={cn("inline-flex min-h-8 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:text-destructive", FOCUS)}
              >
                <Trash2 className="size-3.5" aria-hidden /> Vaciar
              </button>
            )}
          </div>
          {draftLines.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
              Toca un servicio del catálogo para agregarlo al ticket.
            </p>
          ) : (
            <ul className="min-h-0 divide-y overflow-y-auto rounded-xl border">
              {draftLines.map((l) => (
                <li key={`${l.serviceId}:${l.color}`} className="flex items-center gap-3 px-3 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{l.name}</span>{" "}
                    <GarmentColorMark color={l.color} />
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{formatMoney(l.unitPriceCents)}</span>
                  </p>
                  <div className="flex items-center rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setQty(l.serviceId, l.color, l.qty - 1)}
                      aria-label={`Quitar una unidad de ${l.name}`}
                      className={cn("inline-flex size-8 items-center justify-center rounded-md hover:bg-muted md:size-6", FOCUS)}
                    >
                      <Minus className="size-3" aria-hidden />
                    </button>
                    <span className="w-7 text-center font-mono text-xs">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(l.serviceId, l.color, l.qty + 1)}
                      aria-label={`Agregar una unidad de ${l.name}`}
                      className={cn("inline-flex size-8 items-center justify-center rounded-md hover:bg-muted md:size-6", FOCUS)}
                    >
                      <Plus className="size-3" aria-hidden />
                    </button>
                  </div>
                  <span className="w-20 text-right font-mono text-sm">{formatMoney(l.unitPriceCents * l.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="shrink-0">
          <legend className="mb-1.5 flex w-full items-center justify-between gap-2">
            <span className={LABEL}>Entrega</span>
            <span className="text-[11px] text-muted-foreground">
              {draft.express === null
                ? "Elige tipo y fecha"
                : draft.express
                  ? "Cargo de 30%"
                  : "Sin cargo extra"}
            </span>
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed={draft.express === false}
              onClick={() => chooseDelivery(false)}
              className={cn(
                "h-10 rounded-xl border text-sm font-medium transition-colors",
                FOCUS,
                draft.express === false ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              Regular
            </button>
            <button
              type="button"
              aria-pressed={draft.express === true}
              onClick={() => chooseDelivery(true)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors",
                FOCUS,
                draft.express
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-primary hover:bg-accent",
              )}
            >
              <Zap className="size-4" aria-hidden /> Exprés
            </button>
            <button
              type="button"
              onClick={() => (draft.express ? setPickingExpress(true) : setPickingDate(true))}
              disabled={draft.express === null}
              aria-label={deliveryOk ? `Entrega: ${formatDeliveryLong(draft.deliveryDate)}` : "Elegir fecha de entrega"}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-medium transition-colors",
                FOCUS,
                deliveryOk ? "border-primary text-primary hover:bg-accent" : "border-dashed text-muted-foreground hover:bg-muted",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{deliveryOk ? formatDeliveryShort(draft.deliveryDate) : "Fecha"}</span>
            </button>
          </div>
        </fieldset>

        <div className="flex shrink-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="notes" className={LABEL}>
              Observaciones
            </label>
            <span className="font-mono text-[11px] text-muted-foreground">
              {draft.notes.length}/{NOTES_MAX}
            </span>
          </div>
          <textarea
            id="notes"
            rows={2}
            maxLength={NOTES_MAX}
            value={draft.notes}
            onChange={(e) => updateDraft({ notes: sanitizeText(e.target.value, NOTES_MAX) })}
            placeholder="Manchas, botones faltantes, almidón…"
            className={cn(
              "resize-none rounded-xl border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground sm:text-sm short:h-9 short:[scrollbar-width:none]",
              FOCUS,
            )}
          />
        </div>

      </div>

      <div className="shrink-0 border-t bg-muted/60 px-5 py-3">
        <dl className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 font-mono text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt>Subtotal</dt>
            <dd>{formatMoney(draftTotals.subtotal)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>IVA 16%</dt>
            <dd>{formatMoney(draftTotals.tax)}</dd>
          </div>
          {draft.express && (
            <div className="flex basis-full justify-between text-primary">
              <dt>Incluye exprés</dt>
              <dd>{formatMoney(draftTotals.surcharge)}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-col short:flex-row short:items-center short:gap-4">
          <dl className="mt-1 flex items-baseline justify-between font-mono short:mt-0 short:flex-col short:items-start short:gap-0">
            <dt className="font-sans text-sm font-medium">Total</dt>
            <dd className="text-2xl font-medium tracking-tight">{formatMoney(draftTotals.total)}</dd>
          </dl>
          <Button
            size="lg"
            className="mt-2.5 w-full rounded-xl short:mt-0 short:flex-1"
            disabled={draftLines.length === 0 || !customer || !deliveryOk || busy}
            onClick={() => {
              setCheckoutError(null);
              setConfirming(true);
            }}
          >
            Cobrar {formatMoney(draftTotals.total)}
          </Button>
        </div>
        {checkoutError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {checkoutError}
          </p>
        )}
      </div>

      <CheckoutConfirmDialog
        open={confirming}
        deliveryDate={draft.deliveryDate}
        totalCents={draftTotals.total}
        payment={draft.payment}
        busy={busy}
        onPaymentChange={(payment) => updateDraft({ payment })}
        onConfirm={() => void onCheckout()}
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
      />
      <ReceiptDialog order={receipt} onClose={() => setReceipt(null)} />
      <DeliveryDateDialog
        open={pickingDate}
        value={draft.express === false ? draft.deliveryDate : ""}
        onSelect={(deliveryDate) => updateDraft({ deliveryDate })}
        onClose={() => setPickingDate(false)}
      />
      <ExpressDeliveryDialog
        open={pickingExpress}
        value={draft.deliveryDate}
        onSelect={(deliveryDate) => updateDraft({ express: true, deliveryDate })}
        onClose={() => setPickingExpress(false)}
      />
    </aside>
  );
}
