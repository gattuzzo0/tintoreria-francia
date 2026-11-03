import type { Report } from "@/lib/reports-api";

/** El panel se desmonta al cambiar de vista; sin esto cada visita vuelve a agregar las órdenes. */
const FRESH_MS = 30 * 60 * 1000;

type Entry = { at: number; report: Report };

const pages = new Map<string, Entry>();

function key(branch: string, start: string, end: string): string {
  return `${branch}\0${start}\0${end}`;
}

export function readReportCache(branch: string, start: string, end: string): Report | null {
  const hit = pages.get(key(branch, start, end));
  if (!hit) return null;
  if (Date.now() - hit.at > FRESH_MS) {
    pages.delete(key(branch, start, end));
    return null;
  }
  return hit.report;
}

export function writeReportCache(branch: string, start: string, end: string, report: Report): void {
  pages.set(key(branch, start, end), { at: Date.now(), report });
}

export function clearReportsCache(): void {
  pages.clear();
}
