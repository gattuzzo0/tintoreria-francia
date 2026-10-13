import Image from "next/image";

export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative size-10 overflow-hidden rounded-full bg-card ring-1 ring-border">
        <Image src="/logo-francia.png" alt="" fill sizes="40px" priority className="scale-110 object-cover" />
      </div>
      <div className="leading-none" aria-hidden>
        <p className="text-sm font-semibold tracking-tight">Tintorería Francia</p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Punto de venta
        </p>
      </div>
      <span className="sr-only">Tintorería Francia — Punto de venta</span>
    </div>
  );
}
