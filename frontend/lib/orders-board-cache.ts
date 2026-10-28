import type { DeliveredOrder, Order } from "@/lib/pos-data";

/** El tablero se desmonta al cambiar de panel; sin esto cada visita vuelve a leer la base. */
const FRESH_MS = 30 * 60 * 1000;

type Entry = {
  at: number;
  orders: Order[];
  delivered: DeliveredOrder[];
  hasMore: boolean;
};

const pages = new Map<string, Entry>();

export function ordersCacheKey(branch: string, status: string, query: string): string {
  return `${branch}\0${status}\0${query}`;
}

export function readOrdersCache(key: string): Entry | null {
  const hit = pages.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > FRESH_MS) {
    pages.delete(key);
    return null;
  }
  return hit;
}

export function writeOrdersCache(key: string, value: Omit<Entry, "at">): void {
  pages.set(key, { ...value, at: Date.now() });
}

export function clearOrdersCache(): void {
  pages.clear();
}
