"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaidMethod } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { fiscalReady, type FiscalValue } from "@/lib/validation";
import { FiscalForm, fiscalDraft } from "./fiscal-form";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const PAYMENTS: { id: PaidMethod; label: string; icon: typeof CreditCard }[] = [
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { id: "efectivo", label: "Efectivo", icon: Banknote },
];

export type InvoiceResult = { wantsInvoice: boolean; payment?: PaidMethod };

type Step = "payment" | "ask" | "fiscal";

export function InvoiceDialog({
  open,
  customerName,
  fiscal,
  askPayment,
  onSaveFiscal,
  onDone,
  onAbort,
}: {
  open: boolean;
  customerName: string;
  fiscal: FiscalValue;
  askPayment: boolean;
  onSaveFiscal: (value: FiscalValue) => Promise<void>;
  onDone: (result: InvoiceResult) => Promise<void>;
  onAbort: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const [step, setStep] = useState<Step>(askPayment ? "payment" : "ask");
  const [payment, setPayment] = useState<PaidMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setStep(askPayment ? "payment" : "ask");
      setPayment(null);
      setError(null);
      setSending(false);
    }
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      closing.current = true;
      dialog.close();
    }
  }, [open]);

  const finish = async (wantsInvoice: boolean) => {
    if (sending) return;
    if (askPayment && !payment) {
      setError("Elige un método de pago.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onDone({ wantsInvoice, payment: payment ?? undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSending(false);
    }
  };

  const dismiss = () => {
    if (sending || step === "fiscal") return;
    if (step === "payment") onAbort();
    else void finish(false);
  };

  const saveFiscal = async (value: FiscalValue) => {
    setSending(true);
    setError(null);
    try {
      await onSaveFiscal(value);
      await onDone({ wantsInvoice: true, payment: payment ?? undefined });
    } catch (err) {
      setSending(false);
      throw err;
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (closing.current || sending || step === "fiscal") return;
        dismiss();
      }}
      onClose={() => {
        closing.current = false;
      }}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
      aria-labelledby="invoice-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div
          className="max-h-[85dvh] overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="invoice-title" className="font-semibold tracking-tight">
            {step === "payment" ? "Cobrar al entregar" : "¿Desea facturar?"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{customerName}</p>

          {step === "payment" && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {PAYMENTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setPayment(id);
                    setError(null);
                    setStep("ask");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border bg-card px-1 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          )}

          {step === "payment" && (
            <Button type="button" variant="outline" className="mt-4 w-full rounded-xl" disabled={sending} onClick={onAbort}>
              Cancelar
            </Button>
          )}

          {step === "ask" && (
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" disabled={sending} onClick={() => void finish(false)}>
                No
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-xl"
                disabled={sending}
                onClick={() => {
                  if (fiscalReady(fiscal)) void finish(true);
                  else {
                    setError(null);
                    setStep("fiscal");
                  }
                }}
              >
                Sí
              </Button>
            </div>
          )}

          {step === "fiscal" && (
            <FiscalForm
              idPrefix="invoice"
              initial={fiscalDraft(fiscal)}
              required
              busy={sending}
              submitLabel="Guardar"
              cancelLabel="No facturar"
              onCancel={() => void finish(false)}
              onSubmit={saveFiscal}
            />
          )}

          {error && step !== "fiscal" && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
