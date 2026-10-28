"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchInvoiceOrders, type InvoiceOrder } from "@/lib/pos-api";
import { cfdiUseLabel, taxRegimeLabel } from "@/lib/fiscal";
import { formatDate, formatMoney, PAYMENT_LABEL, STATUS_META } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-provider";

export function AccountingView() {
  const { withAuth } = usePos();
  const [rows, setRows] = useState<InvoiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    withAuth(fetchInvoiceOrders).then(
      (list) => {
        if (cancelled) return;
        setRows(list);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron leer las órdenes por facturar.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth, attempt]);

  const subtotalCents = rows?.reduce((sum, row) => sum + row.subtotalCents, 0) ?? 0;
  const taxCents = rows?.reduce((sum, row) => sum + row.taxCents, 0) ?? 0;
  const totalCents = rows?.reduce((sum, row) => sum + row.totalCents, 0) ?? 0;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="accounting-title">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Facturación</p>
        <h1 id="accounting-title" className="text-2xl font-semibold tracking-tight">
          Contabilidad
        </h1>
        {rows && rows.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "orden" : "órdenes"} · Subtotal {formatMoney(subtotalCents)} · IVA{" "}
            {formatMoney(taxCents)} · Total {formatMoney(totalCents)}
          </p>
        )}
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setRows(null);
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : !rows ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando órdenes por facturar" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Orden
                </th>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Datos fiscales
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-normal md:table-cell">
                  Estado
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-normal lg:table-cell">
                  Pago
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-normal sm:table-cell">
                  Sucursal
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Subtotal
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  IVA 16%
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    Ninguna orden solicitó factura.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.folio}>
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium">#{row.folio}</span>
                      <span className="block text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.customerName}</span>
                      {row.phone && <span className="block font-mono text-xs text-muted-foreground">{row.phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={cn("font-mono", row.rfc ? "" : "text-muted-foreground")}>{row.rfc ?? "Sin RFC"}</span>
                      <span className="block">{row.legalName ?? "Sin razón social"}</span>
                      <span className="block text-muted-foreground">
                        CP {row.fiscalZip ?? "—"} · {taxRegimeLabel(row.taxRegime)}
                      </span>
                      <span className="block text-muted-foreground">{cfdiUseLabel(row.cfdiUse)}</span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{STATUS_META[row.status].label}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">{PAYMENT_LABEL[row.payment]}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{row.branch ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(row.subtotalCents)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(row.taxCents)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatMoney(row.totalCents)}
                      {row.surchargeCents > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          Incluye exprés {formatMoney(row.surchargeCents)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t bg-muted/30 font-mono text-xs">
                <tr>
                  <th scope="row" colSpan={3} className="px-4 py-3 text-left font-sans text-sm font-medium">
                    Totales
                  </th>
                  <td className="hidden md:table-cell" />
                  <td className="hidden lg:table-cell" />
                  <td className="hidden sm:table-cell" />
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(subtotalCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(taxCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(totalCents)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
