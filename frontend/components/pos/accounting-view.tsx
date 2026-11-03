"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchInvoiceOrders, type InvoiceOrder } from "@/lib/pos-api";
import { InvoiceFileSlot } from "./invoice-file-slot";
import { cfdiUseLabel, taxRegimeLabel } from "@/lib/fiscal";
import { formatDate, formatMoney, PAYMENT_LABEL, STATUS_META } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-provider";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const FIRST_YEAR = 2024;
const SELECT =
  "h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

function invoiceYears(now = new Date()): number[] {
  const end = Math.max(now.getFullYear(), FIRST_YEAR);
  return Array.from({ length: end - FIRST_YEAR + 1 }, (_, i) => end - i);
}

export function AccountingView() {
  const { withAuth, patchSummary } = usePos();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [rows, setRows] = useState<InvoiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const period = `${year}-${month}`;
  const [fetchedPeriod, setFetchedPeriod] = useState("");
  if (fetchedPeriod !== period) {
    setFetchedPeriod(period);
    setRows(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    withAuth((token) => fetchInvoiceOrders(token, year, month)).then(
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
  }, [withAuth, attempt, year, month]);

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
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Mes</span>
            <select
              aria-label="Mes"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className={SELECT}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Año</span>
            <select
              aria-label="Año"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className={SELECT}
            >
              {invoiceYears().map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
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
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Factura
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
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    Ninguna orden de este mes solicitó factura.
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
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <InvoiceFileSlot
                          folio={row.folio}
                          kind="pdf"
                          loaded={row.hasInvoicePdf}
                          onLoaded={() => {
                            if (!row.hasInvoicePdf && row.hasInvoiceXml) {
                              patchSummary((current) => ({
                                ...current,
                                incompleteInvoices: Math.max(0, current.incompleteInvoices - 1),
                              }));
                            }
                            setRows((current) =>
                              current?.map((item) => (item.folio === row.folio ? { ...item, hasInvoicePdf: true } : item)) ?? null,
                            );
                          }}
                        />
                        <InvoiceFileSlot
                          folio={row.folio}
                          kind="xml"
                          loaded={row.hasInvoiceXml}
                          onLoaded={() => {
                            if (!row.hasInvoiceXml && row.hasInvoicePdf) {
                              patchSummary((current) => ({
                                ...current,
                                incompleteInvoices: Math.max(0, current.incompleteInvoices - 1),
                              }));
                            }
                            setRows((current) =>
                              current?.map((item) => (item.folio === row.folio ? { ...item, hasInvoiceXml: true } : item)) ?? null,
                            );
                          }}
                        />
                      </div>
                    </td>
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
                  <td />
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
