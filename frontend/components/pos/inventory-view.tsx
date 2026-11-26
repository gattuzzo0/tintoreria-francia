"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readBranch } from "@/lib/branches";
import {
  createSupplyItem,
  createSupplyOpening,
  deleteSupplyItem,
  fetchSupplies,
  fetchSupplyItems,
  type SupplyBoard,
  type SupplyItem,
  type SupplyOpening,
  type SupplyUnit,
} from "@/lib/pos-api";
import { sanitizeText } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-provider";

const ITEM_MAX = 80;
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground " +
  FOCUS;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const UNITS: { id: SupplyUnit; label: string }[] = [
  { id: "litro", label: "Litros" },
  { id: "kilogramo", label: "Kilogramos" },
  { id: "pza", label: "Pzas" },
];
const UNIT_SHORT: Record<SupplyUnit, string> = { litro: "L", kilogramo: "kg", pza: "pzas" };

function sanitizeQty(value: string): string {
  const cleaned = value.replace(",", ".").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot < 0) return cleaned.slice(0, 6);
  return `${cleaned.slice(0, dot).slice(0, 6)}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3)}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(y, m - 1, d),
  );
}

function everyLabel(avgDays: number | null): string {
  if (avgDays === null) return "—";
  if (avgDays <= 0) return "el mismo día";
  if (avgDays === 1) return "cada día";
  return `cada ${avgDays} días`;
}

function itemKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function datesFor(openings: SupplyOpening[], item: string): string[] {
  const key = itemKey(item);
  return openings
    .filter((row) => itemKey(row.item) === key)
    .map((row) => row.openedOn)
    .sort();
}

function dayGaps(dates: string[]): { from: string; to: string; days: number }[] {
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const from = dates[i - 1];
    const to = dates[i];
    gaps.push({ from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) });
  }
  return gaps;
}

function OpeningDialog({ item, dates, onClose }: { item: string | null; dates: string[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [item]);

  const gaps = dayGaps(dates);
  const max = Math.max(1, ...gaps.map((gap) => gap.days));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="opening-chart-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {item && (
        <div className="rounded-2xl bg-background p-5 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className={LABEL}>Aperturas</p>
              <h2 id="opening-chart-title" className="text-lg font-semibold tracking-tight">
                {item}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted",
                FOCUS,
              )}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {dates[0] ? `Una sola apertura, el ${formatDay(dates[0])}.` : "Sin aperturas."}
            </p>
          ) : (
            <div className="flex h-56 items-end gap-3 overflow-x-auto" role="img" aria-label={`Días entre aperturas de ${item}`}>
              {gaps.map((gap) => (
                <div key={`${gap.from}-${gap.to}`} className="flex w-20 shrink-0 flex-col items-center justify-end gap-1">
                  <span className="font-mono text-xs">{gap.days <= 0 ? "mismo día" : `${gap.days} d`}</span>
                  <div
                    className="w-8 rounded-t bg-primary"
                    style={{ height: Math.max(6, Math.round((gap.days / max) * 140)) }}
                  />
                  <span className="text-center text-[10px] leading-tight text-muted-foreground">
                    {formatDay(gap.from)}
                    <br />
                    {formatDay(gap.to)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function InventoryView() {
  const { withAuth } = usePos();
  const branch = readBranch();
  const [board, setBoard] = useState<SupplyBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [item, setItem] = useState("");
  const [openedOn, setOpenedOn] = useState(todayIso);
  const [formError, setFormError] = useState<string | null>(null);
  const [articles, setArticles] = useState<SupplyItem[] | null>(null);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [articleName, setArticleName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<SupplyUnit | "">("");
  const [articleError, setArticleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chartItem, setChartItem] = useState<string | null>(null);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    withAuth(async (token) => {
      const [openings, items] = await Promise.allSettled([
        fetchSupplies(token, branch),
        fetchSupplyItems(token, branch),
      ]);
      if (cancelled) return;
      if (openings.status === "fulfilled") {
        setBoard(openings.value);
        setError(null);
      } else {
        const err = openings.reason;
        setError(err instanceof Error ? err.message : "No se pudo leer el inventario.");
      }
      if (items.status === "fulfilled") {
        setArticles(items.value);
        setArticlesError(null);
      } else {
        const err = items.reason;
        setArticlesError(err instanceof Error ? err.message : "No se pudieron leer los artículos.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [withAuth, branch, attempt]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!branch || busy) return;
    const name = item.trim();
    if (!articles?.some((article) => article.name === name)) {
      setFormError("Elige un artículo dado de alta.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) {
      setFormError("Elige el día.");
      return;
    }
    setBusy(true);
    setFormError(null);
    withAuth((token) => createSupplyOpening(token, { branch, item: name, openedOn })).then(
      () => {
        setBusy(false);
        setItem("");
        setOpenedOn(todayIso());
        setAttempt((n) => n + 1);
      },
      (err: unknown) => {
        setBusy(false);
        setFormError(err instanceof Error ? err.message : "No se pudo registrar.");
      },
    );
  };

  const onCreateArticle = (event: FormEvent) => {
    event.preventDefault();
    if (!branch || busy) return;
    const name = articleName.trim();
    if (!name) {
      setArticleError("Escribe el nombre.");
      return;
    }
    if (!unit) {
      setArticleError("Elige la unidad.");
      return;
    }
    const qty = quantity.replace(/\.$/, "");
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(qty) || Number(qty) <= 0) {
      setArticleError("La cantidad debe ser mayor a 0, con hasta 3 decimales.");
      return;
    }
    if (unit === "pza" && qty.includes(".")) {
      setArticleError("Las piezas van en enteros.");
      return;
    }
    setBusy(true);
    setArticleError(null);
    withAuth((token) => createSupplyItem(token, { branch, name, unit, quantity: qty })).then(
      () => {
        setBusy(false);
        setArticleName("");
        setQuantity("");
        setUnit("");
        setAttempt((n) => n + 1);
      },
      (err: unknown) => {
        setBusy(false);
        setArticleError(err instanceof Error ? err.message : "No se pudo dar de alta.");
      },
    );
  };

  const onDeleteArticle = (id: string) => {
    if (busy) return;
    if (!window.confirm("¿Borrar este artículo? No se puede deshacer.")) return;
    setBusy(true);
    setArticlesError(null);
    withAuth((token) => deleteSupplyItem(token, id)).then(
      () => {
        setBusy(false);
        setAttempt((n) => n + 1);
      },
      (err: unknown) => {
        setBusy(false);
        setArticlesError(err instanceof Error ? err.message : "No se pudo borrar el artículo.");
      },
    );
  };

  if (!branch) return <p className="text-sm text-muted-foreground">Elige la sucursal de la caja.</p>;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="inventory-title">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Insumos</p>
        <h1 id="inventory-title" className="text-2xl font-semibold tracking-tight">
          Inventario
        </h1>
        <p className="text-sm text-muted-foreground">
          {branch}
          {board ? ` · ${board.stats.length} ${board.stats.length === 1 ? "insumo" : "insumos"}` : ""}
        </p>
      </div>

      <form noValidate onSubmit={onCreateArticle} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-tight">Nuevo artículo</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_8rem_11rem_auto] md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Nombre</span>
            <input
              autoComplete="off"
              maxLength={ITEM_MAX}
              placeholder="Ej. Cloro, Ganchos"
              value={articleName}
              onChange={(event) => setArticleName(sanitizeText(event.target.value, ITEM_MAX))}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Cantidad</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="20"
              value={quantity}
              onChange={(event) => setQuantity(sanitizeQty(event.target.value))}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Unidad</span>
            <select
              required
              value={unit}
              onChange={(event) => setUnit(event.target.value as SupplyUnit | "")}
              className={INPUT}
            >
              <option value="">Elige</option>
              {UNITS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="h-10 rounded-xl" disabled={busy}>
            {busy ? "Guardando…" : "Dar de alta"}
          </Button>
        </div>
        {articleError && (
          <p role="alert" className="text-sm text-destructive">
            {articleError}
          </p>
        )}
      </form>

      {articlesError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {articlesError}
        </p>
      ) : !articles ? null : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay artículos.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Artículo
                </th>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Cantidad
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {articles.map((article) => (
                <tr key={article.id}>
                  <td className="px-4 py-3">{article.name}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {article.quantity} {UNIT_SHORT[article.unit]}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={cn("rounded-md px-2 py-1 text-muted-foreground hover:text-destructive", FOCUS)}
                      disabled={busy}
                      onClick={() => onDeleteArticle(article.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-tight">Abrí uno nuevo</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_11rem_auto] md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Artículo</span>
            <select
              required
              value={articles?.some((article) => article.name === item) ? item : ""}
              onChange={(event) => setItem(event.target.value)}
              disabled={!articles?.length}
              className={INPUT}
            >
              <option value="">{articles?.length ? "Elige" : "Da de alta un artículo primero"}</option>
              {articles?.map((article) => (
                <option key={article.id} value={article.name}>
                  {article.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Fecha</span>
            <input
              type="date"
              required
              value={openedOn}
              onChange={(event) => setOpenedOn(event.target.value)}
              className={INPUT}
            />
          </label>
          <Button type="submit" className="h-10 rounded-xl" disabled={busy || !articles?.length}>
            {busy ? "Guardando…" : "Registrar"}
          </Button>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </form>

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : !board ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando inventario" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-normal whitespace-nowrap">
                    Artículo
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-normal whitespace-nowrap">
                    Promedio entre aperturas
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-normal whitespace-nowrap">
                    Última apertura
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal whitespace-nowrap">
                    Total de aperturas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {board.stats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      Aún no registras aperturas.
                    </td>
                  </tr>
                ) : (
                  board.stats.map((stat) => (
                    <tr
                      key={stat.item}
                      tabIndex={0}
                      className="cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                      aria-label={`Ver aperturas de ${stat.item}`}
                      onClick={() => setChartItem(stat.item)}
                      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setChartItem(stat.item);
                        }
                      }}
                    >
                      <td className="px-4 py-3">{stat.item}</td>
                      <td className="px-4 py-3">{everyLabel(stat.avgDays)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDay(stat.lastOpened)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{stat.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
          </table>
        </div>
      )}
      <OpeningDialog
        item={chartItem}
        dates={chartItem && board ? datesFor(board.openings, chartItem) : []}
        onClose={() => setChartItem(null)}
      />
    </section>
  );
}
