/** Calidades inclusive, en centésimas para no acumular error de float. */
export function qualityLadder(start: number, step: number, floor: number): number[] {
  const startC = Math.round(start * 100);
  const stepC = Math.round(step * 100);
  const floorC = Math.round(floor * 100);
  const out: number[] = [];
  for (let q = startC; q > floorC; q -= stepC) out.push(q / 100);
  out.push(floorC / 100);
  return out;
}

export function shrinkBox(width: number, height: number): { width: number; height: number } | null {
  if (width < 900) return null;
  const nextW = Math.round(width * 0.88);
  const nextH = Math.round(height * 0.88);
  if (nextW < 720 || nextH < 960) return { width: 720, height: 960 };
  return { width: nextW, height: nextH };
}

function checkEncodePlan(): void {
  const cents = (values: number[]) => values.map((q) => Math.round(q * 100)).join(",");
  const webp = qualityLadder(0.68, 0.04, 0.42).filter((q) => q > 0.48);
  if (cents(webp) !== "68,64,60,56,52") throw new Error(`webp ${cents(webp)}`);
  if (cents(qualityLadder(0.72, 0.04, 0.42)) !== "72,68,64,60,56,52,48,44,42") throw new Error("jpeg");
  if (cents(qualityLadder(0.62, 0.05, 0.4)) !== "62,57,52,47,42,40") throw new Error("shrink");
  const box = shrinkBox(1080, 1440);
  if (!box || box.width !== 950 || box.height !== 1267) throw new Error(`box ${box?.width}x${box?.height}`);
  if (shrinkBox(800, 1067) !== null) throw new Error("under 900");
  const clamped = shrinkBox(900, 1000);
  if (!clamped || clamped.width !== 720 || clamped.height !== 960) throw new Error("clamp");
}

const entry = typeof process !== "undefined" ? process.argv?.[1] : "";
if (entry?.replaceAll("\\", "/").endsWith("photo-canvas-plan.ts")) checkEncodePlan();
