"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatMoney } from "@/lib/pos-data";

export function ExtraDialog({
  open,
  title,
  labelledBy,
  garment,
  options,
  priceFor,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  labelledBy: string;
  garment: string;
  options: readonly { id: string; label: string; pct: number }[];
  priceFor: (id: string) => number;
  onSelect: (id: string) => void;
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
      aria-labelledby={labelledBy}
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="rounded-2xl bg-white p-5 text-neutral-900 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={labelledBy} className="text-base font-semibold tracking-tight">
                {title}
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
          <div className="flex flex-col gap-2">
            {options.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item.id)}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left outline-none hover:border-neutral-900 focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <span>
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="font-mono text-xs text-neutral-500">+{item.pct}%</span>
                </span>
                <span className="font-mono text-sm">{formatMoney(priceFor(item.id))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
