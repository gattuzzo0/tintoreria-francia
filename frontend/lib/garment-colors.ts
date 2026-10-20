export type GarmentColor = { id: string; label: string; hex: string };

/** Orden del selector: 4 columnas, igual a la cuadrícula. */
export const GARMENT_COLORS: GarmentColor[] = [
  { id: "negro", label: "Negro", hex: "#1a1a1a" },
  { id: "blanco", label: "Blanco", hex: "#ffffff" },
  { id: "rojo", label: "Rojo", hex: "#ef3b3b" },
  { id: "azul", label: "Azul", hex: "#1d4ed8" },
  { id: "azul_claro", label: "Azul claro", hex: "#3b82f6" },
  { id: "verde", label: "Verde", hex: "#22c55e" },
  { id: "amarillo", label: "Amarillo", hex: "#f5d90a" },
  { id: "rosa", label: "Rosa", hex: "#ec4899" },
  { id: "cafe", label: "Café", hex: "#7a4a2a" },
  { id: "naranja", label: "Naranja", hex: "#f97316" },
  { id: "morado", label: "Morado", hex: "#7c3aed" },
];

const BY_ID = new Map(GARMENT_COLORS.map((c) => [c.id, c]));

export function garmentColor(id: string): GarmentColor | null {
  return BY_ID.get(id) ?? null;
}

/** ponytail: tab no sale en ids de servicio. */
const SEP = "\t";

export function lineKey(serviceId: string, color: string): string {
  return `${serviceId}${SEP}${color}`;
}

export function parseLineKey(key: string): { serviceId: string; color: string } | null {
  const i = key.indexOf(SEP);
  if (i <= 0) return null;
  const serviceId = key.slice(0, i);
  const color = key.slice(i + 1);
  if (!serviceId || !garmentColor(color)) return null;
  return { serviceId, color };
}

export function qtyForService(quantities: Record<string, number>, serviceId: string): number {
  const prefix = `${serviceId}${SEP}`;
  let n = 0;
  for (const [k, q] of Object.entries(quantities)) if (k.startsWith(prefix)) n += q;
  return n;
}

{
  const parsed = parseLineKey(lineKey("s1", "rojo"));
  if (!parsed || parsed.serviceId !== "s1" || parsed.color !== "rojo") throw new Error("lineKey");
  if (parseLineKey("s1") !== null) throw new Error("parseLineKey");
  if (!garmentColor("rosa") || !garmentColor("azul_claro")) throw new Error("garmentColor");
}
