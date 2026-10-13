"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/pos-data";
import { cn } from "@/lib/utils";

export const CARD = "min-w-0 rounded-2xl border bg-card p-5";
export const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className={LABEL}>{eyebrow}</p>
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
    </div>
  );
}

export function Kpi({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const up = delta !== null && delta >= 0;
  return (
    <div className={CARD}>
      <p className={LABEL}>{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium tracking-tight">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {delta === null ? (
          "Sin datos del periodo anterior"
        ) : (
          <>
            <span className={cn("inline-flex items-center font-mono", up ? "text-primary" : "text-destructive")}>
              {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {Math.abs(delta).toFixed(1)}%
            </span>
            vs. periodo anterior
          </>
        )}
      </p>
    </div>
  );
}

export function DailyChart({ points }: { points: { date: string; salesCents: number; orders: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.salesCents));
  const every = Math.max(1, Math.ceil(points.length / 10));
  return (
    <div>
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label="Ventas por día">
        {points.map((p) => (
          <div key={p.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(p.salesCents > 0 ? 2 : 0, (p.salesCents / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border bg-card px-2 py-1 text-[11px] whitespace-nowrap shadow-sm group-hover:block">
              <span className="font-mono">{shortDate(p.date)}</span> · {formatMoney(p.salesCents)} · {p.orders} órd.
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px]">
        {points.map((p, i) => (
          <span key={p.date} className="min-w-0 flex-1 text-center whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            {i % every === 0 ? shortDate(p.date) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarList({ rows }: { rows: { key: string; label: string; value: number; display: string; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-mono">
              {r.display}
              {r.hint && <span className="ml-1.5 text-xs text-muted-foreground">{r.hint}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Heatmap({ cells }: { cells: { weekday: number; hour: number; orders: number }[] }) {
  const hours = cells.map((c) => c.hour);
  const from = Math.min(8, ...hours);
  const to = Math.max(20, ...hours);
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const count = (wd: number, h: number) => cells.find((c) => c.weekday === wd && c.hour === h)?.orders ?? 0;
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <div
      className="relative overflow-x-auto rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      tabIndex={0}
      role="region"
      aria-label="Mapa de calor desplazable"
    >
      <table className="w-full border-separate border-spacing-[3px] text-[10px]" aria-label="Órdenes por día y hora">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Día</span>
            </th>
            {range.map((h) => (
              <th key={h} scope="col" className="font-mono font-normal text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((name, wd) => (
            <tr key={name}>
              <th scope="row" className="pr-1 text-left font-mono font-normal text-muted-foreground">
                {name}
              </th>
              {range.map((h) => {
                const n = count(wd, h);
                return (
                  <td
                    key={h}
                    title={`${name} ${h}:00 · ${n} órdenes`}
                    className="h-6 min-w-6 rounded-sm bg-muted text-center font-mono"
                    style={n ? { backgroundColor: `color-mix(in oklch, var(--primary) ${20 + (n / max) * 80}%, transparent)` } : undefined}
                  >
                    <span className={cn(n / max > 0.5 ? "text-primary-foreground" : "text-foreground", !n && "sr-only")}>{n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="mt-1 font-mono text-xl font-medium">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}
