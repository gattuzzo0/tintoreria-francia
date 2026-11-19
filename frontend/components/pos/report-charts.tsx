"use client";

import { useLayoutEffect, useRef, useState } from "react";
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

function placeDailyTip(tip: HTMLElement, bar: HTMLElement) {
  const pad = 8;
  const b = bar.getBoundingClientRect();
  tip.style.maxWidth = "";
  tip.style.whiteSpace = "";
  let t = tip.getBoundingClientRect();
  const maxW = window.innerWidth - pad * 2;
  if (t.width > maxW) {
    tip.style.maxWidth = `${maxW}px`;
    tip.style.whiteSpace = "normal";
    t = tip.getBoundingClientRect();
  }
  const header = document.querySelector("header")?.getBoundingClientRect();
  const nav = document.querySelector('nav[aria-label="Secciones"]')?.getBoundingClientRect();
  const minY = Math.max(pad, header && header.bottom > 0 ? header.bottom + pad : pad);
  let maxY = window.innerHeight - pad;
  if (nav && nav.top > window.innerHeight * 0.5) maxY = Math.min(maxY, nav.top - pad);
  const left = Math.max(pad, Math.min(b.left + b.width / 2 - t.width / 2, window.innerWidth - t.width - pad));
  let top = b.top - t.height - 6;
  if (top < minY) top = b.top + 4;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(minY, Math.min(top, Math.max(minY, maxY - t.height)))}px`;
  tip.style.visibility = "visible";
}

export function DailyChart({ points }: { points: { date: string; salesCents: number; orders: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.salesCents));
  const every = Math.max(1, Math.ceil(points.length / 10));
  // ponytail: one fixed tip, clamped to the viewport. Per-bar absolute tips leave the screen.
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ?? open;
  const selected = points.find((p) => p.date === active);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    const bar = plotRef.current?.querySelector<HTMLElement>(`[data-date="${active ?? ""}"]`);
    if (!tip || !bar || !active) return;
    const place = () => placeDailyTip(tip, bar);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [active, points]);

  return (
    <div>
      <div ref={plotRef} className="flex h-44 items-end gap-[3px]" role="group" aria-label="Ventas por día">
        {points.map((p) => (
            <button
              key={p.date}
              type="button"
              data-date={p.date}
              aria-pressed={open === p.date}
              aria-label={`${shortDate(p.date)}, ${formatMoney(p.salesCents)}, ${p.orders} órdenes`}
              onClick={() => {
                setHover(null);
                setOpen(open === p.date ? null : p.date);
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHover(p.date);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setHover(null);
              }}
              className="relative flex h-full min-w-0 flex-1 cursor-pointer touch-manipulation appearance-none items-end border-0 bg-transparent p-0 outline-none"
            >
              <span
                className={cn("w-full rounded-t-sm bg-primary/80", open === p.date && "bg-green-600")}
                style={{ height: `${Math.max(p.salesCents > 0 ? 2 : 0, (p.salesCents / max) * 100)}%` }}
              />
            </button>
        ))}
      </div>
      {selected && (
        <span
          ref={tipRef}
          className="pointer-events-none invisible fixed z-20 rounded-md border bg-card px-2 py-1 text-[11px] whitespace-nowrap shadow-sm"
        >
          <span className="font-mono">{shortDate(selected.date)}</span> · {formatMoney(selected.salesCents)} · {selected.orders} órd.
        </span>
      )}
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
