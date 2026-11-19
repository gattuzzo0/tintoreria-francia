"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { GARMENT_COLORS, GARMENT_PATTERNS, garmentColor, patternText } from "@/lib/garment-colors";
import { cn } from "@/lib/utils";

export function GarmentColorMark({ color, pattern = "" }: { color: string; pattern?: string }) {
  const c = garmentColor(color);
  const design = patternText(pattern);
  if (!c && !design) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {c ? <span className="size-2.5 rounded-full border border-black/20" style={{ background: c.hex }} /> : null}
      {[c?.label, design].filter(Boolean).join(" · ")}
    </span>
  );
}

function patternBackground(id: string): CSSProperties | undefined {
  if (id === "rayas") {
    return {
      backgroundImage: "repeating-linear-gradient(90deg, transparent 0 4px, rgba(43,38,34,0.55) 4px 6px)",
    };
  }
  if (id === "cuadros") {
    return {
      backgroundImage:
        "linear-gradient(90deg, rgba(43,38,34,0.45) 1px, transparent 1px), linear-gradient(rgba(43,38,34,0.45) 1px, transparent 1px)",
      backgroundSize: "8px 8px",
    };
  }
  return undefined;
}

function ColorForm({
  garment,
  onSelect,
  onClose,
}: {
  garment: string;
  onSelect: (color: string, pattern: string) => void;
  onClose: () => void;
}) {
  const [color, setColor] = useState<string | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);
  const ready = color !== null && pattern !== null;

  return (
    <div className="rounded-2xl bg-white p-5 text-neutral-900 shadow-2xl">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="color-revolver-title" className="text-base font-semibold tracking-tight">
            Color de la prenda
          </h2>
          <p className="truncate text-sm text-neutral-500">{garment}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex size-8 items-center justify-center rounded-full text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {GARMENT_COLORS.map((item) => {
          const selected = color === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setColor(item.id)}
              className="group flex flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <span className="relative">
                <span
                  className={cn(
                    "block size-14 rounded-full border border-black/10",
                    selected && "ring-2 ring-green-500",
                  )}
                  style={{ background: item.hex }}
                />
                {selected && (
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-green-500 text-white">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-500">{item.label}</span>
            </button>
          );
        })}
      </div>

      <fieldset className="mt-5 flex flex-col gap-2">
        <legend className="text-sm font-medium">Diseño</legend>
        <div className="grid grid-cols-3 gap-2">
          {GARMENT_PATTERNS.map((item) => {
            const art = patternBackground(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={pattern === item.id}
                onClick={() => setPattern(item.id)}
                className={cn(
                  "relative isolate flex h-12 items-center justify-start overflow-hidden rounded-xl border bg-white px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  pattern === item.id ? "border-neutral-900 ring-1 ring-neutral-900/25" : "border-neutral-200 hover:border-neutral-300",
                )}
              >
                {art && (
                  <span
                    aria-hidden
                    style={art}
                    className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-3/5 opacity-70 [mask-image:linear-gradient(to_left,black_25%,transparent_95%)]"
                  />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          if (!color || !pattern) return;
          onSelect(color, pattern);
          onClose();
        }}
        className="mt-4 h-11 w-full rounded-xl bg-neutral-900 text-sm font-medium text-white outline-none hover:bg-neutral-800 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Agregar
      </button>
    </div>
  );
}

export function ColorRevolver({
  open,
  garment,
  onSelect,
  onClose,
}: {
  open: boolean;
  garment: string;
  onSelect: (color: string, pattern: string) => void;
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
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="color-revolver-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && <ColorForm key={garment} garment={garment} onSelect={onSelect} onClose={() => ref.current?.close()} />}
    </dialog>
  );
}
