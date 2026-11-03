"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readBranch } from "@/lib/branches";
import { clearOrdersCache } from "@/lib/orders-board-cache";
import { createRefund } from "@/lib/pos-api";
import { formatMoney, PAYMENT_LABEL, type Order } from "@/lib/pos-data";
import { clearReportsCache } from "@/lib/reports-cache";
import { usePos } from "./pos-provider";

export function RefundActions({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (order: Order) => void;
}) {
  const { withAuth, patchSummary } = usePos();
  const caja = readBranch();
  const sameBranch = Boolean(caja && order.branch === caja);
  const hasNote =
    order.notes.trim().length > 0 ||
    Boolean(order.photoId) ||
    (order.photoIds?.length ?? 0) > 0 ||
    order.staffNotes.length > 0;
  const canRefund =
    sameBranch && hasNote && (order.payment === "efectivo" || order.payment === "tarjeta") && !order.refund;
  const [confirm, setConfirm] = useState<"ask" | "sure" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canRefund) return null;

  const refund = async () => {
    if (!caja || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await withAuth((token) => createRefund(token, order.folio, caja));
      clearOrdersCache();
      clearReportsCache();
      const leftColumn = order.status !== "entregado";
      patchSummary((current) => ({
        ...current,
        incompleteInvoices:
          order.payment === "efectivo" && order.wantsInvoice
            ? Math.max(0, current.incompleteInvoices - 1)
            : current.incompleteInvoices,
        ...(leftColumn
          ? {
              [order.status]: Math.max(0, current[order.status] - 1),
              entregado: current.entregado + 1,
            }
          : {}),
      }));
      onUpdated({
        ...order,
        status: "entregado",
        wantsInvoice: order.payment === "efectivo" ? false : order.wantsInvoice,
        refund: { originalPayment: saved.originalPayment, recharged: false },
      });
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reembolsar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
      {confirm === null && (
        <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={() => setConfirm("ask")}>
          Reembolsar
        </Button>
      )}
      {confirm === "ask" && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-sm font-medium">Devolver {formatMoney(order.totalCents)} en efectivo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            El cobro original fue {PAYMENT_LABEL[order.payment].toLowerCase()}.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => setConfirm("sure")}>
              Reembolsar
            </Button>
          </div>
        </div>
      )}
      {confirm === "sure" && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-sm font-medium">¿Confirmas la devolución?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se entregan {formatMoney(order.totalCents)} en efectivo. No se puede deshacer.
          </p>
          <Button type="button" className="mt-3 w-full" disabled={busy} onClick={() => void refund()}>
            {busy ? "Devolviendo…" : "Sí, devolver"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => setConfirm("ask")}
          >
            Volver
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
