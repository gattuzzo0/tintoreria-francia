"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatMoney, PAYMENT_LABEL } from "@/lib/pos-data";
import { fetchReport, type Report } from "@/lib/reports-api";
import { cn } from "@/lib/utils";
import { BarList, CARD, DailyChart, Heatmap, Kpi, LABEL, SectionTitle, Stat } from "./report-charts";
import { usePos } from "./pos-provider";

type Preset = "hoy" | "7d" | "30d" | "mes" | "mes-anterior" | "custom";

const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes-anterior", label: "Mes anterior" },
];

const MAX_RANGE_DAYS = 366;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(p: Exclude<Preset, "custom">): { start: string; end: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const daysAgo = (n: number) => new Date(y, m, today.getDate() - n);
  switch (p) {
    case "hoy":
      return { start: iso(today), end: iso(today) };
    case "7d":
      return { start: iso(daysAgo(6)), end: iso(today) };
    case "30d":
      return { start: iso(daysAgo(29)), end: iso(today) };
    case "mes":
      return { start: iso(new Date(y, m, 1)), end: iso(today) };
    case "mes-anterior":
      return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
  }
}

function rangeError(start: string, end: string): string | null {
  if (!start || !end) return "Elige ambas fechas.";
  if (end < start) return "La fecha final debe ser igual o posterior a la inicial.";
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return `El periodo máximo es de ${MAX_RANGE_DAYS} días.`;
  return null;
}

function formatHours(h: number | null): string {
  if (h === null) return "—";
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
}

export function ReportsView() {
  const { withAuth } = usePos();
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalid = rangeError(range.start, range.end);

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    withAuth((t) => fetchReport(t, range.start, range.end)).then(
      (r) => {
        if (cancelled) return;
        setReport(r);
        setError(null);
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo generar el reporte."),
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth, range.start, range.end, invalid]);

  const loading = !invalid && (!report || report.start !== range.start || report.end !== range.end) && !error;

  const choosePreset = (p: Exclude<Preset, "custom">) => {
    setPreset(p);
    setRange(presetRange(p));
    setError(null);
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="reports-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Estadística</p>
          <h1 id="reports-title" className="text-2xl font-semibold tracking-tight">
            Reportes
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1" role="group" aria-label="Periodo">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePreset(p.id)}
                aria-pressed={preset === p.id}
                className={cn(
                  "h-8 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                  preset === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Desde</span>
              <input
                type="date"
                value={range.start}
                max={range.end || undefined}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, start: e.target.value }));
                  setError(null);
                }}
                className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-base outline-none sm:text-sm focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Hasta</span>
              <input
                type="date"
                value={range.end}
                min={range.start || undefined}
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, end: e.target.value }));
                  setError(null);
                }}
                className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-base outline-none sm:text-sm focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </label>
          </div>
        </div>
      </div>

      {invalid || error ? (
        <p role="alert" className="text-sm text-destructive">
          {invalid ?? error}
        </p>
      ) : loading || !report ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Generando reporte" />
        </div>
      ) : (
        <ReportBody report={report} />
      )}
    </section>
  );
}

function ReportBody({ report: r }: { report: Report }) {
  const { summary: s, previous: p } = r;
  const totalPayments = r.payments.reduce((n, x) => n + x.salesCents, 0);
  const totalBranches = r.branches.reduce((n, x) => n + x.salesCents, 0);
  const totalCustomers = r.customers.newCount + r.customers.returningCount;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Ventas" value={formatMoney(s.salesCents)} current={s.salesCents} previous={p.salesCents} />
        <Kpi label="Órdenes" value={String(s.orders)} current={s.orders} previous={p.orders} />
        <Kpi label="Ticket promedio" value={formatMoney(s.avgTicketCents)} current={s.avgTicketCents} previous={p.avgTicketCents} />
        <Kpi label="Prendas recibidas" value={String(s.pieces)} current={s.pieces} previous={p.pieces} />
        <Kpi label="Órdenes exprés" value={`${s.expressPct.toFixed(1)}%`} current={s.expressPct} previous={p.expressPct} />
      </div>

      <section className={CARD} aria-labelledby="rep-daily">
        <SectionTitle id="rep-daily" eyebrow="Tendencia" title="Ventas por día" />
        <DailyChart points={r.daily} />
      </section>

      <section className={CARD} aria-labelledby="rep-pending">
        <SectionTitle id="rep-pending" eyebrow="Hoy en tienda" title="Pendientes" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr_1.4fr]">
          <div className="flex flex-col gap-4">
            <Stat
              label="Por cobrar"
              value={formatMoney(r.pending.receivableCents)}
              hint={`${r.pending.receivableOrders} órdenes con pago al recoger`}
            />
            <Stat label="Listas sin recoger" value={`${r.pending.readyOrders} órdenes`} hint={`${r.pending.readyPieces} prendas`} />
          </div>
          <div>
            <p className={cn(LABEL, "mb-3")}>Antigüedad de lo listo</p>
            <BarList
              rows={r.pending.aging.map((a) => ({
                key: a.label,
                label: a.label,
                value: a.orders,
                display: `${a.orders}`,
                hint: `${a.pieces} prendas`,
              }))}
            />
          </div>
          <div>
            <p className={cn(LABEL, "mb-3")}>Más tiempo esperando</p>
            {r.pending.oldestReady.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay órdenes listas pendientes.</p>
            ) : (
              <ul className="divide-y text-sm">
                {r.pending.oldestReady.map((o) => (
                  <li key={o.folio} className="flex items-center gap-3 py-2">
                    <span className="font-mono">#{o.folio}</span>
                    <span className="min-w-0 flex-1 truncate">{o.customerName}</span>
                    <span className={cn("font-mono text-xs", o.days > 30 ? "text-destructive" : "text-muted-foreground")}>
                      {o.days} d
                    </span>
                    <span className="w-24 text-right font-mono">{formatMoney(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={CARD} aria-labelledby="rep-services">
          <SectionTitle id="rep-services" eyebrow="Sin cargo exprés" title="Servicios más vendidos" />
          <BarList
            rows={r.services.slice(0, 10).map((x) => ({
              key: x.serviceId,
              label: x.name,
              value: x.revenueCents,
              display: formatMoney(x.revenueCents),
              hint: `× ${x.qty}`,
            }))}
          />
        </section>
        <div className="flex flex-col gap-6">
          <section className={CARD} aria-labelledby="rep-categories">
            <SectionTitle id="rep-categories" eyebrow="Mezcla" title="Ventas por categoría" />
            <BarList
              rows={r.categories.map((c) => ({
                key: c.category,
                label: c.category,
                value: c.revenueCents,
                display: formatMoney(c.revenueCents),
                hint: `× ${c.qty}`,
              }))}
            />
          </section>
          <section className={CARD} aria-labelledby="rep-payments">
            <SectionTitle id="rep-payments" eyebrow="Cobro" title="Métodos de pago" />
            <BarList
              rows={r.payments.map((x) => ({
                key: x.method,
                label: PAYMENT_LABEL[x.method],
                value: x.salesCents,
                display: formatMoney(x.salesCents),
                hint: totalPayments ? `${Math.round((x.salesCents / totalPayments) * 100)}% · ${x.orders} órd.` : undefined,
              }))}
            />
          </section>
          <section className={CARD} aria-labelledby="rep-branches">
            <SectionTitle id="rep-branches" eyebrow="Ubicación" title="Ventas por sucursal" />
            <BarList
              rows={r.branches.map((x) => ({
                key: x.branch,
                label: x.branch,
                value: x.salesCents,
                display: formatMoney(x.salesCents),
                hint: totalBranches ? `${Math.round((x.salesCents / totalBranches) * 100)}% · ${x.orders} órd.` : undefined,
              }))}
            />
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className={CARD} aria-labelledby="rep-customers">
          <SectionTitle id="rep-customers" eyebrow="Clientes" title="Nuevos y recurrentes" />
          <div className="mb-5 grid grid-cols-2 gap-4">
            <Stat
              label="Nuevos"
              value={String(r.customers.newCount)}
              hint={totalCustomers ? `${Math.round((r.customers.newCount / totalCustomers) * 100)}%` : undefined}
            />
            <Stat
              label="Recurrentes"
              value={String(r.customers.returningCount)}
              hint={totalCustomers ? `${Math.round((r.customers.returningCount / totalCustomers) * 100)}%` : undefined}
            />
          </div>
          <p className={cn(LABEL, "mb-3")}>Los que más compran</p>
          {r.customers.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
          ) : (
            <ol className="divide-y text-sm">
              {r.customers.top.map((c, i) => (
                <li key={c.customerId} className="flex items-center gap-3 py-2">
                  <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.orders} órd.</span>
                  <span className="w-24 text-right font-mono">{formatMoney(c.salesCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className={CARD} aria-labelledby="rep-peak">
          <SectionTitle id="rep-peak" eyebrow="Para planear personal" title="Horas y días pico de recepción" />
          <Heatmap cells={r.peak} />
        </section>
      </div>

      <section className={CARD} aria-labelledby="rep-cycle">
        <SectionTitle id="rep-cycle" eyebrow="Operación" title="Tiempo de proceso" />
        {!r.cycle.available ? (
          <p className="text-sm text-muted-foreground">
            Disponible al aplicar la actualización de base de datos (historial de estados).
          </p>
        ) : r.cycle.measured === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay órdenes del periodo marcadas como listas.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-4">
            <Stat label="Recibido → listo" value={formatHours(r.cycle.readyHoursAvg)} hint="promedio" />
            <Stat label="Listo → entregado" value={formatHours(r.cycle.pickupHoursAvg)} hint="promedio" />
            <Stat
              label="A tiempo"
              value={r.cycle.onTimePct === null ? "—" : `${r.cycle.onTimePct.toFixed(1)}%`}
              hint="listas dentro de la fecha prometida"
            />
            <Stat label="Medidas" value={String(r.cycle.measured)} hint="órdenes del periodo" />
          </div>
        )}
      </section>
    </div>
  );
}
