"use client";

import { useEffect, useRef } from "react";
import { CalendarDays, X, Zap } from "lucide-react";
import { addDays, deliveryOn, deliveryWindow, formatDeliveryLong, formatDeliveryShort, formatMonthShort, isSunday, parseIsoDate, toIsoDate, type RushRates } from "@/lib/delivery";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Semanas completas (lunes a domingo) que cubren la ventana de entrega. */
function calendarDays(min: string, max: string): Date[] {
  const first = parseIsoDate(min);
  const last = parseIsoDate(max);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const end = addDays(last, 6 - ((last.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export function DeliveryDateDialog({
  open,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const { min, max } = deliveryWindow();
  const days = calendarDays(min, max);
  const months = [...new Set([min, max].map((iso) => {
    const d = parseIsoDate(iso);
    return `${formatMonthShort(d)} ${d.getFullYear()}`;
  }))];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="delivery-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="rounded-2xl bg-background p-5 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="mb-4 flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CalendarDays className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="delivery-title" className="font-semibold tracking-tight">
                Fecha de entrega · Regular
              </h2>
              <p className="text-xs text-muted-foreground">{months.join(" – ")}</p>
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

          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="Días disponibles">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="pb-1 font-mono text-[11px] text-muted-foreground" aria-hidden>
                {d}
              </span>
            ))}
            {days.map((d) => {
              const iso = toIsoDate(d);
              const enabled = iso >= min && iso <= max && !isSunday(d);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={selected}
                  aria-label={formatDeliveryLong(iso)}
                  onClick={() => {
                    onSelect(iso);
                    ref.current?.close();
                  }}
                  className={cn(
                    "relative flex h-10 flex-col items-center justify-center rounded-lg font-mono text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                    !enabled && "cursor-not-allowed text-muted-foreground/40 line-through",
                    enabled && !selected && "border bg-card hover:border-primary hover:bg-accent",
                    selected && "bg-primary text-primary-foreground",
                  )}
                >
                  {d.getDate()}
                  {d.getDate() === 1 && (
                    <span className="absolute -top-1.5 rounded bg-background px-1 text-[9px] text-muted-foreground">
                      {formatMonthShort(d)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Disponible del {formatDeliveryLong(min)} al {formatDeliveryLong(max)}. Los domingos no hay entrega.
          </p>
        </div>
      )}
    </dialog>
  );
}

const CHOICE =
  "min-h-14 rounded-xl border px-2 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30";

export function ExpressDeliveryDialog({
  open,
  value,
  rates,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: string;
  rates: RushRates;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const today = deliveryOn(0);
  const next = deliveryOn(1);
  const urgent = deliveryOn(2);
  const extra = value === today || value === next;
  const nextDay = value === next;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="express-delivery-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="rounded-2xl bg-background p-5 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="mb-4 flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Zap className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="express-delivery-title" className="font-semibold tracking-tight">
                Entrega exprés
              </h2>
              <p className="text-xs text-muted-foreground">Extra urgente u urgente</p>
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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={extra}
              onClick={() => {
                if (!extra) onSelect(today);
              }}
              className={cn(CHOICE, extra ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              Extra urgente
              <span className="mt-0.5 block text-[11px] font-normal">
                {rates.extraSamePct}% hoy · {rates.extraNextPct}% mañana
              </span>
            </button>
            <button
              type="button"
              aria-pressed={value === urgent}
              onClick={() => {
                onSelect(urgent);
                ref.current?.close();
              }}
              className={cn(
                CHOICE,
                value === urgent ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              Urgente
              <span className="mt-0.5 block text-[11px] font-normal">
                {rates.urgentPct}% · {formatDeliveryShort(urgent)}
              </span>
            </button>
          </div>

          {extra && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <span className={cn(nextDay ? "font-semibold text-foreground" : "text-foreground/35")}>Día siguiente</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  role="switch"
                  checked={!nextDay}
                  aria-label={nextDay ? "Entrega al día siguiente" : "Entrega hoy"}
                  onChange={(e) => onSelect(deliveryOn(e.target.checked ? 0 : 1))}
                  className="peer sr-only"
                />
                <span className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30" />
                <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
              </label>
              <span className={cn(!nextDay ? "font-semibold text-foreground" : "text-foreground/35")}>Hoy</span>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {extra
              ? formatDeliveryLong(value)
              : value === urgent
                ? `Entrega en 2 días · ${formatDeliveryLong(urgent)}`
                : "Extra urgente: hoy o mañana. Urgente: en 2 días."}
          </p>
        </div>
      )}
    </dialog>
  );
}
