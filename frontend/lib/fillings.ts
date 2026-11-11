import { lengthOf } from "@/lib/lengths";

/** Porcentajes sobre el precio de catálogo. La misma cuenta está en create_order. */
export const FILLINGS = [
  { id: "medio", label: "Relleno medio", pct: 30 },
  { id: "abundante", label: "Relleno abundante", pct: 60 },
  { id: "maxi", label: "Maxi relleno", pct: 85 },
] as const;

export type FillingId = (typeof FILLINGS)[number]["id"];

const BY_ID = new Map<string, (typeof FILLINGS)[number]>(FILLINGS.map((item) => [item.id, item]));

export function needsFilling(name: string): boolean {
  return name.toLocaleLowerCase("es").includes("relleno");
}

export function fillingOf(id: string) {
  return BY_ID.get(id) ?? null;
}

/** Centavos. Relleno y largo se suman sobre el precio de catálogo. */
export function linePrice(priceCents: number, fill: string, length = ""): number {
  const pct = (fillingOf(fill)?.pct ?? 0) + (lengthOf(length)?.pct ?? 0);
  return Math.round((priceCents * (100 + pct)) / 100);
}

export function filledPrice(priceCents: number, fill: string): number {
  return linePrice(priceCents, fill);
}

export function fillingText(id: string): string {
  const item = fillingOf(id);
  return item ? `${item.label} +${item.pct}%` : "";
}

{
  if (!needsFilling("Chaleco relleno") || !needsFilling("Cojín decorativo con relleno")) throw new Error("needsFilling");
  if (needsFilling("Chaleco de plumas") || needsFilling("Edredón")) throw new Error("needsFilling extra");
  if (filledPrice(10000, "medio") !== 13000) throw new Error("medio");
  if (filledPrice(10000, "abundante") !== 16000) throw new Error("abundante");
  if (filledPrice(9000, "maxi") !== 16650) throw new Error("maxi");
  if (filledPrice(10000, "") !== 10000) throw new Error("sin relleno");
  if (linePrice(15000, "", "tres_cuartos") !== 18750) throw new Error("tres cuartos");
  if (linePrice(15000, "", "extra") !== 25500) throw new Error("extra largo");
}
