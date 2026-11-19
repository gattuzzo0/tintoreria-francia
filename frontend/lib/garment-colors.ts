import { fillingOf } from "@/lib/fillings";
import { lengthOf } from "@/lib/lengths";

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

/** Obligatorio al elegir color. Ninguno se guarda y no se imprime. */
export const GARMENT_PATTERNS = [
  { id: "rayas", label: "Rayas" },
  { id: "cuadros", label: "Cuadros" },
  { id: "ninguno", label: "Ninguno" },
] as const;

export type GarmentPatternId = (typeof GARMENT_PATTERNS)[number]["id"];

const PATTERN_IDS = new Set<string>(GARMENT_PATTERNS.map((item) => item.id));

export function isGarmentPattern(id: string): id is GarmentPatternId {
  return PATTERN_IDS.has(id);
}

export function patternText(id: string): string {
  if (id === "rayas") return "Rayas";
  if (id === "cuadros") return "Cuadros";
  return "";
}

/** ponytail: tab no sale en ids de servicio. */
const SEP = "\t";

export function lineKey(
  serviceId: string,
  color: string,
  fill = "",
  length = "",
  pattern = "",
  pressOnly = false,
): string {
  return `${serviceId}${SEP}${color}${SEP}${fill}${SEP}${length}${SEP}${pattern}${SEP}${pressOnly ? "1" : ""}`;
}

export function parseLineKey(
  key: string,
): { serviceId: string; color: string; fill: string; length: string; pattern: string; pressOnly: boolean } | null {
  const parts = key.split(SEP);
  if (parts.length !== 6) return null;
  const [serviceId, color, fill, length, pattern, press] = parts;
  if (
    !serviceId ||
    (color !== "" && !garmentColor(color)) ||
    (fill !== "" && !fillingOf(fill)) ||
    (length !== "" && !lengthOf(length)) ||
    (pattern !== "" && !isGarmentPattern(pattern)) ||
    (press !== "" && press !== "1")
  ) {
    return null;
  }
  return { serviceId, color, fill, length, pattern, pressOnly: press === "1" };
}

export function qtyForService(quantities: Record<string, number>, serviceId: string): number {
  const prefix = `${serviceId}${SEP}`;
  let n = 0;
  for (const [k, q] of Object.entries(quantities)) if (k.startsWith(prefix)) n += q;
  return n;
}

{
  const parsed = parseLineKey(lineKey("s1", "rojo", "", "", "ninguno"));
  if (!parsed || parsed.serviceId !== "s1" || parsed.color !== "rojo" || parsed.pattern !== "ninguno") throw new Error("lineKey");
  if (parseLineKey("s1") !== null || parseLineKey("s1\trojo") !== null) throw new Error("parseLineKey");
  const filled = parseLineKey(lineKey("s19", "negro", "medio", "", "rayas"));
  if (!filled || filled.fill !== "medio" || filled.pattern !== "rayas") throw new Error("fill key");
  const long = parseLineKey(lineKey("s126", "blanco", "", "extra", "cuadros"));
  if (!long || long.length !== "extra" || long.pattern !== "cuadros") throw new Error("length key");
  if (!garmentColor("rosa") || !garmentColor("azul_claro") || patternText("ninguno") !== "") throw new Error("garmentColor");
  const kilo = parseLineKey(lineKey("s7", ""));
  if (!kilo || kilo.color !== "" || kilo.pattern !== "" || kilo.pressOnly) throw new Error("kilo");
  const pressed = parseLineKey(lineKey("s1", "azul", "", "", "ninguno", true));
  if (!pressed || !pressed.pressOnly) throw new Error("press");
}
