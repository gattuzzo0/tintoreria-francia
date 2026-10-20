"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { GARMENT_COLORS, garmentColor } from "@/lib/garment-colors";

export function GarmentColorMark({ color }: { color: string }) {
  const c = garmentColor(color);
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="size-2.5 rounded-full border border-black/20" style={{ background: c.hex }} />
      {c.label}
    </span>
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
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const pick = (id: string) => {
    onSelect(id);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="color-revolver-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
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
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className="inline-flex size-8 items-center justify-center rounded-full text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {GARMENT_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => pick(color.id)}
                className="group flex flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <span className="relative">
                  <span
                    className="block size-14 rounded-full border border-black/10 group-hover:ring-2 group-hover:ring-green-500 group-focus-visible:ring-2 group-focus-visible:ring-green-500"
                    style={{ background: color.hex }}
                  />
                  <span className="absolute -top-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-green-500 text-white group-hover:flex group-focus-visible:flex">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                </span>
                <span className="text-xs text-neutral-500">{color.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
