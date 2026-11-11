/** Porcentajes sobre el precio de catálogo. La misma cuenta está en create_order. */
export const LENGTHS = [
  { id: "tres_cuartos", label: "Tres cuartos", pct: 25 },
  { id: "mediapierna", label: "Mediapierna", pct: 50 },
  { id: "largo", label: "Largo", pct: 60 },
  { id: "extra", label: "Extra largo", pct: 70 },
] as const;

const BY_ID = new Map<string, (typeof LENGTHS)[number]>(LENGTHS.map((item) => [item.id, item]));

export function needsLength(name: string): boolean {
  return name.toLocaleLowerCase("es").includes("largo");
}

export function lengthOf(id: string) {
  return BY_ID.get(id) ?? null;
}

export function lengthText(id: string): string {
  const item = lengthOf(id);
  return item ? `${item.label} +${item.pct}%` : "";
}

{
  if (!needsLength("Cojín tubular largo")) throw new Error("needsLength");
  if (needsLength("Camisa de caballero manga larga/corta") || needsLength("Chaleco relleno")) throw new Error("needsLength extra");
}
