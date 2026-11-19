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

/** Solo planchado cobra este porcentaje del precio ya con relleno y largo. */
export const PRESS_ONLY_PCT = 60;

/** Centavos. Relleno y largo se suman sobre el precio de catálogo. */
export function linePrice(priceCents: number, fill: string, length = "", pressOnly = false): number {
  const pct = (fillingOf(fill)?.pct ?? 0) + (lengthOf(length)?.pct ?? 0);
  const full = Math.round((priceCents * (100 + pct)) / 100);
  return pressOnly ? Math.round((full * PRESS_ONLY_PCT) / 100) : full;
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
  if (linePrice(12000, "", "", true) !== 7200) throw new Error("solo planchado");
  if (linePrice(15000, "", "tres_cuartos", true) !== 11250) throw new Error("solo planchado con largo");
}
