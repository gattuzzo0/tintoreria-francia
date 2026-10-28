"use client";

import { useEffect, useRef } from "react";
import { Banknote, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDeliveryLong } from "@/lib/delivery";
import { formatMoney, type PaymentMethod } from "@/lib/pos-data";
import { cn } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const PAYMENTS: { id: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "pendiente", label: "Al recoger", icon: Clock },
];

export function CheckoutConfirmDialog({
  open,
  deliveryDate,
  totalCents,
  payment,
  busy,
  onPaymentChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  deliveryDate: string;
  totalCents: number;
  payment: PaymentMethod;
  busy: boolean;
  onPaymentChange: (payment: PaymentMethod) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !busy) ref.current?.close();
      }}
      aria-labelledby="checkout-confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="rounded-2xl bg-background p-5 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="mb-4 flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Banknote className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="checkout-confirm-title" className="font-semibold tracking-tight">
                Confirmar cobro
              </h2>
              <p className="text-xs text-muted-foreground">Revisa fecha, pago y total antes de generar el ticket.</p>
            </div>
          </div>

          <dl className="flex flex-col gap-3 rounded-xl border bg-muted/40 px-4 py-3">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Fecha de entrega
              </dt>
              <dd className="mt-0.5 text-base font-medium">{formatDeliveryLong(deliveryDate)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Costo total
              </dt>
              <dd className="mt-0.5 font-mono text-2xl font-medium tracking-tight">
                {formatMoney(totalCents)}
              </dd>
            </div>
          </dl>

          <fieldset className="mt-4">
            <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Método de pago
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map(({ id, label, icon: Icon }) => {
                const active = payment === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => onPaymentChange(id)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-[11px] font-medium transition-colors",
                      FOCUS,
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              disabled={busy}
              onClick={() => ref.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="button" className="flex-1 rounded-xl" disabled={busy} onClick={onConfirm}>
              OK
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
