"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronRight, Menu, Plus, RotateCcw } from "lucide-react";
import { qtyForService } from "@/lib/garment-colors";
import { CATEGORIES, categoriesForMenu, formatMoney } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { CategoryDrawer } from "./category-drawer";
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
  const tabs = categoriesForMenu(all.map((s) => s.category));
  const [picked, setPicked] = useState<string>(CATEGORIES[0]);
  const tab = tabs.includes(picked) ? picked : (tabs[0] ?? CATEGORIES[0]);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
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

      <button
        ref={menuButton}
        type="button"
        aria-expanded={menu}
        aria-controls="category-drawer"
        onClick={() => setMenu(true)}
        className="flex h-12 w-full items-center gap-3 rounded-xl border bg-card px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Menu className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Categoría</span>
          <span className="block truncate text-sm font-medium">{tab}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <CategoryDrawer
        open={menu}
        items={tabs.map((t) => ({ id: t, label: t, selected: t === tab }))}
        onPick={(id) => {
          setPicked(id);
          setMenu(false);
          menuButton.current?.focus();
        }}
        onClose={() => {
          setMenu(false);
          menuButton.current?.focus();
        }}
      />

      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Sin servicios en esta categoría.
        </p>
      ) : (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {services.map((s) => {
          const qty = qtyForService(draft.quantities, s.id);
          return (
            <li key={s.id} className="relative">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (s.unit === "kg") addItem(s.id, "");
                  else setPicking({ id: s.id, name: s.name });
                }}
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
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
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
      )}
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
