import type { Report } from "@/lib/reports-api";

/** El panel se desmonta al cambiar de vista; sin esto cada visita vuelve a agregar las órdenes. */
const FRESH_MS = 30 * 60 * 1000;

type Entry = { at: number; report: Report };

const pages = new Map<string, Entry>();

function key(start: string, end: string): string {
  return `${start}\0${end}`;
}

export function readReportCache(start: string, end: string): Report | null {
  const hit = pages.get(key(start, end));
  if (!hit) return null;
  if (Date.now() - hit.at > FRESH_MS) {
    pages.delete(key(start, end));
    return null;
  }
  return hit.report;
}

export function writeReportCache(start: string, end: string, report: Report): void {
  pages.set(key(start, end), { at: Date.now(), report });
}

export function clearReportsCache(): void {
  pages.clear();
}
