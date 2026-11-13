export type TicketWidthMm = 58 | 80;

const STORAGE_KEY = "tf-ticket-width-mm";
const PAGE_STYLE_ID = "tf-ticket-page-size";

/**
 * Ancho útil del ticket (no el del papel).
 * Térmica ~203 dpi + fuente ASCII 9×17 ≈ 42 cols en 58 mm → ~48 mm;
 * en 80 mm ≈ 64 cols → ~72 mm. Dejar margen derecho evita el corte.
 */
export function ticketContentWidthMm(paper: TicketWidthMm): number {
  return paper === 58 ? 48 : 72;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeTicketWidth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isTicketWidthMm(value: unknown): value is TicketWidthMm {
  return value === 58 || value === 80;
}

export function readTicketWidthMm(): TicketWidthMm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (isTicketWidthMm(n)) return n;
  } catch {
    // private mode / blocked storage / SSR
  }
  return 58;
}

export function saveTicketWidthMm(mm: TicketWidthMm): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(mm));
  } catch {
    // private mode / blocked storage
  }
  applyTicketPageStyle(mm);
  emit();
}

/** @page debe coincidir con el rollo; se actualiza al elegir y antes de imprimir. */
export function applyTicketPageStyle(mm: TicketWidthMm = readTicketWidthMm()): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${mm}mm auto; margin: 0; }`;
  document.documentElement.dataset.ticketMm = String(mm);
}

{
  if (!isTicketWidthMm(58) || !isTicketWidthMm(80) || isTicketWidthMm(72)) throw new Error("ticket width");
}
