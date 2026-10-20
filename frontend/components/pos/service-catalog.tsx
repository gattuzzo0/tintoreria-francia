"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, RotateCcw } from "lucide-react";
import { qtyForService } from "@/lib/garment-colors";
import { CATEGORIES, formatMoney, type Category } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { ColorRevolver } from "./color-revolver";
import { CustomerLookup } from "./customer-lookup";
import { usePos } from "./pos-provider";

export function ServiceCatalog({
  onRegisterPhone,
  lookupKey = 0,
}: {
  onRegisterPhone: (phone: string) => void;
  lookupKey?: number;
}) {
  const { draft, addItem, clearService, services: all } = usePos();
  const [tab, setTab] = useState<Category>("Prendas");
  const [picking, setPicking] = useState<{ id: string; name: string } | null>(null);
  const locked = !draft.customerId;
  const services = all.filter((s) => s.category === tab);

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-5" aria-labelledby="catalog-title">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 id="catalog-title" className="text-2xl font-semibold tracking-tight">
            Servicios
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Nueva recepción</p>
        </div>
        <CustomerLookup
          key={lookupKey}
          onRegisterPhone={onRegisterPhone}
          compact
          className="w-full lg:hidden"
        />
      </div>

      <div role="tablist" aria-label="Categorías" className="flex gap-1.5 sm:gap-2">
        {CATEGORIES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-9 flex-1 rounded-full border px-2 text-sm sm:h-8 sm:flex-none sm:px-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              tab === t
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {services.map((s) => {
          const qty = qtyForService(draft.quantities, s.id);
          return (
            <li key={s.id} className="relative">
              <button
                type="button"
                disabled={locked}
                onClick={() => setPicking({ id: s.id, name: s.name })}
                className={cn(
                  "group relative isolate flex min-h-32 w-full flex-col justify-between gap-6 overflow-hidden rounded-xl border bg-card p-4 text-left transition-all duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  locked
                    ? "cursor-not-allowed opacity-45"
                    : "hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_12px_30px_-18px] hover:shadow-foreground/30",
                  qty > 0 && "border-primary/50 ring-1 ring-primary/30",
                )}
              >
                {s.imagePath && (
                  <Image
                    src={s.imagePath}
                    alt=""
                    aria-hidden
                    width={320}
                    height={320}
                    className="absolute inset-y-0 right-0 -z-10 h-full w-3/5 object-cover opacity-70 saturate-125 transition duration-500 [mask-image:linear-gradient(to_left,black_25%,transparent_95%)] group-hover:scale-105 group-hover:opacity-90 dark:opacity-55 dark:group-hover:opacity-75"
                  />
                )}
                <span className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {s.category}
                  </span>
                  {qty > 0 ? (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-xs text-primary-foreground">
                      {qty}
                      <span className="sr-only"> en el ticket</span>
                    </span>
                  ) : (
                    <span className="inline-flex size-6 items-center justify-center rounded-full border bg-card transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <Plus className="size-3.5" aria-hidden />
                    </span>
                  )}
                </span>
                <span className={cn("flex flex-col gap-0.5", qty > 0 && "pr-9")}>
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="font-mono text-sm">
                    {formatMoney(s.priceCents)}
                    <span className="text-muted-foreground"> / {s.unit}</span>
                  </span>
                </span>
              </button>
              {qty > 0 && !locked && (
                <button
                  type="button"
                  onClick={() => clearService(s.id)}
                  aria-label={`Reiniciar cantidad de ${s.name}`}
                  title="Reiniciar cantidad"
                  className="absolute right-3 bottom-3 inline-flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors outline-none hover:border-destructive/40 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ColorRevolver
        open={picking !== null}
        garment={picking?.name ?? ""}
        onSelect={(color) => {
          if (picking) addItem(picking.id, color);
        }}
        onClose={() => setPicking(null)}
      />
    </section>
  );
}
