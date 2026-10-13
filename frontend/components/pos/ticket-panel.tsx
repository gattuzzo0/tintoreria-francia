"use client";

import { useState } from "react";
import {
  Banknote,
  CalendarDays,
  Clock,
  CreditCard,
  Minus,
  Plus,
  Repeat,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiHttpError } from "@/lib/api-client";
import { formatDeliveryLong, formatDeliveryShort, isInDeliveryWindow } from "@/lib/delivery";
import { formatMoney, type Order, type PaymentMethod } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import {
  digitsOnly,
  NOTES_MAX,
  PHONE_DIGITS,
  sanitizeNameInput,
  sanitizePhoneInput,
  sanitizeText,
  validateCustomer,
} from "@/lib/validation";
import { usePos } from "./pos-provider";
import { DeliveryDateDialog } from "./delivery-date-dialog";
import { ReceiptDialog } from "./receipt-dialog";

const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm placeholder:text-muted-foreground aria-invalid:border-destructive " +
  FOCUS;

const PAYMENTS: { id: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "transferencia", label: "Transfer.", icon: Repeat },
  { id: "pendiente", label: "Al recoger", icon: Clock },
];

type LookupStatus = "idle" | "invalid" | "missing";

export function TicketPanel({ onRegisterPhone }: { onRegisterPhone: (phone: string) => void }) {
  const { draft, draftLines, draftTotals, orders, customers, setQty, updateDraft, checkout, addCustomer, getCustomer } =
    usePos();
  const customer = draft.customerId ? getCustomer(draft.customerId) : undefined;

  const [phone, setPhone] = useState(() => (customer ? digitsOnly(customer.phone) : ""));
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  // Una fecha elegida ayer puede quedar fuera de la ventana al cambiar el día.
  const deliveryOk = Boolean(draft.deliveryDate) && isInDeliveryWindow(draft.deliveryDate);
  const deliveryReady = draft.express !== null && deliveryOk;

  const chooseDelivery = (express: boolean) => {
    updateDraft({ express });
    setPickingDate(true);
  };

  const nextFolio = Math.max(1000, ...orders.map((o) => o.folio)) + 1;
  const pieces = draftLines.reduce((n, l) => n + l.qty, 0);

  const onPhoneChange = (value: string) => {
    setPhone(sanitizePhoneInput(value));
    setStatus("idle");
    if (draft.customerId) updateDraft({ customerId: null });
  };

  const onLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== PHONE_DIGITS) {
      setStatus("invalid");
      updateDraft({ customerId: null });
      return;
    }
    const found = customers.find((c) => digitsOnly(c.phone) === phone);
    if (found) {
      setStatus("idle");
      updateDraft({ customerId: found.id });
    } else {
      setStatus("missing");
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCustomer(
      newName,
      newPhone,
      customers.map((c) => c.phone),
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      const created = await addCustomer({ name: result.name, phone: result.phone });
      updateDraft({ customerId: created.id });
      setPhone(digitsOnly(result.phone));
      setStatus("idle");
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el cliente.";
      setErrors(err instanceof ApiHttpError && err.status === 409 ? { phone: msg } : { name: msg });
    } finally {
      setBusy(false);
    }
  };

  const toggleCreating = () => {
    setCreating((v) => !v);
    setErrors({});
  };

  const onCheckout = async () => {
    setCheckoutError(null);
    setBusy(true);
    try {
      const order = await checkout();
      if (!order) return;
      setReceipt(order);
      setPhone("");
      setStatus("idle");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "No se pudo registrar la orden.");
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
        {/* Cliente */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={creating ? "new-customer-name" : "customer"} className={LABEL}>
              Cliente
            </label>
            <button
              type="button"
              onClick={toggleCreating}
              className={cn("inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline", FOCUS)}
            >
              {creating ? (
                "Cancelar"
              ) : (
                <>
                  <UserPlus className="size-3.5" aria-hidden /> Nuevo
                </>
              )}
            </button>
          </div>

          {creating ? (
            <form noValidate onSubmit={(e) => void onCreate(e)} className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
              <input
                id="new-customer-name"
                className={INPUT}
                placeholder="Nombre completo"
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(sanitizeNameInput(e.target.value))}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "new-customer-name-error" : undefined}
                aria-label="Nombre completo"
              />
              {errors.name && (
                <p id="new-customer-name-error" role="alert" className="text-xs text-destructive">
                  {errors.name}
                </p>
              )}
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                className={cn(INPUT, "font-mono tracking-wider")}
                placeholder="Teléfono (10 dígitos)"
                autoComplete="off"
                value={newPhone}
                onChange={(e) => setNewPhone(sanitizePhoneInput(e.target.value))}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "new-customer-phone-error" : undefined}
                aria-label="Teléfono"
              />
              {errors.phone && (
                <p id="new-customer-phone-error" role="alert" className="text-xs text-destructive">
                  {errors.phone}
                </p>
              )}
              <Button type="submit" className="rounded-xl" disabled={busy}>
                Guardar cliente
              </Button>
            </form>
          ) : (
            <>
              <form noValidate onSubmit={onLookup} className="flex gap-2">
                <input
                  id="customer"
                  type="tel"
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  className={cn(INPUT, "font-mono tracking-wider")}
                  placeholder="Teléfono (10 dígitos)"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  aria-invalid={status === "invalid"}
                  aria-describedby="customer-lookup-result"
                />
                <Button type="submit" variant="outline" size="icon-lg" className="rounded-xl" aria-label="Buscar cliente">
                  <Search aria-hidden />
                </Button>
              </form>
              <div id="customer-lookup-result" aria-live="polite" className="min-h-5 text-sm">
                {customer ? (
                  <p className="flex items-center gap-2">
                    <UserCheck className="size-4 text-primary" aria-hidden />
                    <span className="font-medium">{customer.name}</span>
                  </p>
                ) : status === "missing" ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <UserX className="size-4" aria-hidden />
                      Cliente no registrado aún
                    </p>
                    <button
                      type="button"
                      onClick={() => onRegisterPhone(phone)}
                      className={cn("inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline", FOCUS)}
                    >
                      <UserPlus className="size-3.5" aria-hidden /> Dar de alta
                    </button>
                  </div>
                ) : status === "invalid" ? (
                  <p role="alert" className="text-destructive">
                    Ingresa los 10 dígitos del teléfono.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Prendas */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className={LABEL}>Prendas</h2>
            {draftLines.length > 0 && (
              <button
                type="button"
                onClick={() => updateDraft({ quantities: {} })}
                className={cn("inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-destructive", FOCUS)}
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
                <li key={l.serviceId} className="flex items-center gap-3 px-3 py-1.5">
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{l.name}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{formatMoney(l.unitPriceCents)}</span>
                  </p>
                  <div className="flex items-center rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setQty(l.serviceId, l.qty - 1)}
                      aria-label={`Quitar una unidad de ${l.name}`}
                      className={cn("inline-flex size-6 items-center justify-center rounded-md hover:bg-muted", FOCUS)}
                    >
                      <Minus className="size-3" aria-hidden />
                    </button>
                    <span className="w-7 text-center font-mono text-xs">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(l.serviceId, l.qty + 1)}
                      aria-label={`Agregar una unidad de ${l.name}`}
                      className={cn("inline-flex size-6 items-center justify-center rounded-md hover:bg-muted", FOCUS)}
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

        {/* Entrega */}
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
              onClick={() => setPickingDate(true)}
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

        {/* Observaciones */}
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
              "resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground short:h-9 short:[scrollbar-width:none]",
              FOCUS,
            )}
          />
        </div>

        {/* Pago */}
        <fieldset
          disabled={!deliveryReady}
          className="shrink-0 transition-opacity disabled:opacity-50 [&_button]:disabled:cursor-not-allowed"
        >
          <legend className={cn(LABEL, "mb-1.5")}>Método de pago</legend>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENTS.map(({ id, label, icon: Icon }) => {
              const active = draft.payment === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateDraft({ payment: id })}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-[11px] font-medium transition-colors",
                    FOCUS,
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="shrink-0 border-t bg-muted/60 px-5 py-3">
        <dl className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
          <div className="flex justify-between gap-4">
            <div className="flex gap-2">
              <dt>Subtotal</dt>
              <dd>{formatMoney(draftTotals.subtotal)}</dd>
            </div>
            <div className="flex gap-2">
              <dt>IVA 16%</dt>
              <dd>{formatMoney(draftTotals.tax)}</dd>
            </div>
          </div>
          {draft.express && (
            <div className="flex justify-between text-primary">
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
            disabled={draftLines.length === 0 || !customer || !deliveryReady || busy}
            onClick={() => void onCheckout()}
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

      <ReceiptDialog order={receipt} onClose={() => setReceipt(null)} />
      <DeliveryDateDialog
        open={pickingDate}
        value={deliveryOk ? draft.deliveryDate : ""}
        express={draft.express === true}
        onSelect={(deliveryDate) => updateDraft({ deliveryDate })}
        onClose={() => setPickingDate(false)}
      />
    </aside>
  );
}
