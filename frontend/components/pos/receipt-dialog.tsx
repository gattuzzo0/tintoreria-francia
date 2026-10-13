"use client";

import { useEffect, useRef } from "react";
import { Check, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, type Order } from "@/lib/pos-data";
import { usePos } from "./pos-provider";
import { PrintableTicket } from "./printable-ticket";

export function ReceiptDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { getCustomer } = usePos();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (order && !dialog.open) dialog.showModal();
    if (!order && dialog.open) dialog.close();
  }, [order]);

  const customer = order ? getCustomer(order.customerId) : undefined;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="receipt-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {order && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-start gap-3 border-b px-5 py-4">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="receipt-title" className="font-semibold tracking-tight">
                Orden #{order.folio} registrada
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {customer?.name} · <span className="font-mono">{formatMoney(order.totalCents)}</span> · Vista previa de impresión
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="overflow-y-auto bg-muted px-4 py-6">
            <div className="mx-auto max-w-[80mm] drop-shadow-lg print:filter-none">
              <PrintableTicket order={order} customer={customer} />
              <div className="ticket-edge" aria-hidden />
            </div>
          </div>

          <div className="flex gap-2 border-t px-5 py-4">
            <Button className="flex-1 rounded-xl" onClick={() => window.print()}>
              <Printer aria-hidden /> Imprimir ticket
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => ref.current?.close()}>
              Nueva venta
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
