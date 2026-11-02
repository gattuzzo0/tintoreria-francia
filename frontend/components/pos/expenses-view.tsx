"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readBranch } from "@/lib/branches";
import { formatMoney, PAYMENT_LABEL } from "@/lib/pos-data";
import {
  createExpense,
  deleteExpense,
  fetchExpenseMonths,
  fetchExpenses,
  updateExpense,
  type Expense,
  type ExpensePayment,
} from "@/lib/pos-api";
import { sanitizeText } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-provider";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const FIRST_YEAR = 2026;
const YEAR_AHEAD = 5;
const MONTH_TICK = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PAYMENTS: ExpensePayment[] = ["efectivo", "tarjeta", "transferencia"];
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground " +
  FOCUS;
const SELECT = INPUT;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

type Draft = {
  id: string | null;
  spentOn: string;
  pesos: string;
  concept: string;
  paymentMethod: ExpensePayment;
};

function expenseYears(): number[] {
  return Array.from({ length: YEAR_AHEAD + 1 }, (_, i) => FIRST_YEAR + i);
}

function blankDraft(): Draft {
  return { id: null, spentOn: "", pesos: "", concept: "", paymentMethod: "efectivo" };
}

function monthBounds(year: number, month: number): { min: string; max: string } {
  const mm = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return { min: `${year}-${mm}-01`, max: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

function draftError(draft: Draft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.spentOn)) return "Elige el día.";
  if (!/^[1-9]\d{0,6}$/.test(draft.pesos)) return "El monto es en pesos enteros, de 1 a 9999999.";
  if (!draft.concept.trim()) return "El concepto es obligatorio.";
  return null;
}

function YearChart({
  year,
  totals,
  selected,
  onSelect,
}: {
  year: number;
  totals: number[];
  selected: number;
  onSelect: (month: number) => void;
}) {
  const max = Math.max(...totals, 1);
  return (
    <div className="flex h-full min-h-16 w-full items-end gap-1" role="group" aria-label={`Gastos de ${year} por mes`}>
      {MONTH_TICK.map((tick, index) => {
        const cents = totals[index] ?? 0;
        const active = index + 1 === selected;
        const height = cents > 0 ? Math.max(6, Math.round((cents / max) * 40)) : 3;
        return (
          <button
            key={tick}
            type="button"
            title={`${MONTHS[index]} · ${formatMoney(cents)}`}
            aria-label={`${MONTHS[index]}, ${formatMoney(cents)}`}
            aria-pressed={active}
            onClick={() => onSelect(index + 1)}
            className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-md", FOCUS)}
          >
            <span
              className={cn("w-1 rounded-full", active ? "bg-primary" : cents > 0 ? "bg-foreground/25" : "bg-border")}
              style={{ height }}
            />
            <span className={cn("font-mono text-[10px] tracking-wide", active ? "text-foreground" : "text-muted-foreground")}>
              {tick}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatSpentOn(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(y, m - 1, d),
  );
}

export function ExpensesView() {
  const { withAuth } = usePos();
  const branch = readBranch();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [monthsCents, setMonthsCents] = useState<number[] | null>(null);
  const period = `${branch ?? ""}:${year}-${month}`;
  const yearKey = `${branch ?? ""}:${year}`;
  const [fetchedYear, setFetchedYear] = useState("");
  if (fetchedYear !== yearKey) {
    setFetchedYear(yearKey);
    setMonthsCents(null);
  }
  const [fetchedPeriod, setFetchedPeriod] = useState("");
  if (fetchedPeriod !== period) {
    setFetchedPeriod(period);
    setRows(null);
    setError(null);
  }

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    withAuth((token) => fetchExpenses(token, { branch, year, month })).then(
      (list) => {
        if (cancelled) return;
        setRows(list);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron leer los gastos.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth, attempt, year, month, branch]);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    withAuth((token) => fetchExpenseMonths(token, { branch, year })).then(
      (totals) => {
        if (!cancelled) setMonthsCents(totals);
      },
      () => {
        if (!cancelled) setMonthsCents(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth, attempt, year, branch]);

  const showPeriod = (nextMonth: number, nextYear = year) => {
    setMonth(nextMonth);
    if (nextYear !== year) setYear(nextYear);
    setDraft((current) => {
      if (!current?.spentOn) return current;
      const [y, m] = current.spentOn.split("-");
      if (Number(y) === nextYear && Number(m) === nextMonth) return current;
      return { ...current, spentOn: "" };
    });
  };

  const totalCents = rows?.reduce((sum, row) => sum + row.amountCents, 0) ?? 0;

  const retry = () => {
    setRows(null);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !branch || busy) return;
    const problem = draftError(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    const body = {
      spentOn: draft.spentOn,
      amountCents: Number(draft.pesos) * 100,
      concept: draft.concept.trim(),
      paymentMethod: draft.paymentMethod,
    };
    const [savedYear, savedMonth] = draft.spentOn.split("-").map(Number);
    const editingId = draft.id;
    setBusy(true);
    setFormError(null);
    const call = editingId
      ? (token: string) => updateExpense(token, editingId, body)
      : (token: string) => createExpense(token, { ...body, branch });
    withAuth(call).then(
      () => {
        setBusy(false);
        setDraft(null);
        setYear(savedYear);
        setMonth(savedMonth);
        setAttempt((n) => n + 1);
      },
      (err: unknown) => {
        setBusy(false);
        setFormError(err instanceof Error ? err.message : "No se pudo guardar el gasto.");
      },
    );
  };

  const onDelete = (row: Expense) => {
    if (busy) return;
    if (!window.confirm("¿Borrar este gasto? No se puede deshacer.")) return;
    setBusy(true);
    setError(null);
    withAuth((token) => deleteExpense(token, row.id)).then(
      () => {
        setBusy(false);
        setRows((current) => current?.filter((item) => item.id !== row.id) ?? null);
        setMonthsCents((current) => {
          if (!current) return current;
          const index = Number(row.spentOn.slice(5, 7)) - 1;
          const next = current.slice();
          next[index] = Math.max(0, (next[index] ?? 0) - row.amountCents);
          return next;
        });
        if (draft?.id === row.id) setDraft(null);
      },
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : "No se pudo borrar el gasto.");
      },
    );
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="expenses-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Salidas</p>
          <h1 id="expenses-title" className="text-2xl font-semibold tracking-tight">
            Gastos
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className={LABEL}>Mes</span>
              <select
                aria-label="Mes"
                value={month}
                onChange={(event) => showPeriod(Number(event.target.value))}
                className={cn(SELECT, "w-auto")}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className={LABEL}>Año</span>
              <select
                aria-label="Año"
                value={year}
                onChange={(event) => showPeriod(month, Number(event.target.value))}
                className={cn(SELECT, "w-auto")}
              >
                {expenseYears().map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rows && branch && (
            <p className="mt-1 text-sm text-muted-foreground">
              {branch} · {rows.length} {rows.length === 1 ? "gasto" : "gastos"} · Total {formatMoney(totalCents)}
            </p>
          )}
        </div>
        {monthsCents && monthsCents.length === 12 && (
          <div className="flex h-16 min-w-64 flex-1 items-end self-end px-2 sm:px-8 sm:pb-7">
            <YearChart year={year} totals={monthsCents} selected={month} onSelect={showPeriod} />
          </div>
        )}
        <Button
          variant={draft ? "outline" : "default"}
          className="h-10 rounded-xl"
          aria-expanded={Boolean(draft)}
          aria-controls="expense-form"
          onClick={() => {
            setFormError(null);
            setDraft((current) => (current ? null : blankDraft()));
          }}
        >
          {draft ? <X aria-hidden /> : <Plus aria-hidden />}
          {draft ? "Cancelar" : "Nuevo gasto"}
        </Button>
      </div>

      {draft && (
        <form id="expense-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <div>
            {draft.id && <p className={LABEL}>Edición</p>}
            <h2 className="text-lg font-semibold tracking-tight">{draft.id ? "Editar gasto" : "Registrar gasto"}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Fecha</span>
              <span className="relative">
                <input
                  type="date"
                  required
                  min={monthBounds(year, month).min}
                  max={monthBounds(year, month).max}
                  value={draft.spentOn}
                  onChange={(event) => setDraft({ ...draft, spentOn: event.target.value })}
                  aria-label={`Día de ${MONTHS[month - 1]} de ${year}`}
                  className={cn(INPUT, !draft.spentOn && "text-transparent [&::-webkit-datetime-edit]:opacity-0")}
                />
                {!draft.spentOn && (
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base sm:text-sm">
                    <span className="text-muted-foreground">día</span>
                    <span className="px-1 text-muted-foreground">/</span>
                    {MONTHS[month - 1]}
                    <span className="px-1 text-muted-foreground">/</span>
                    {year}
                  </span>
                )}
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Monto (pesos)</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="150"
                value={draft.pesos}
                onChange={(event) =>
                  setDraft({ ...draft, pesos: event.target.value.replace(/\D/g, "").slice(0, 7) })
                }
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1.5 md:col-span-2">
              <span className={LABEL}>Concepto</span>
              <input
                autoComplete="off"
                maxLength={200}
                placeholder="Ej. Renta del local"
                value={draft.concept}
                onChange={(event) => setDraft({ ...draft, concept: sanitizeText(event.target.value, 200) })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Pago</span>
              <select
                value={draft.paymentMethod}
                onChange={(event) =>
                  setDraft({ ...draft, paymentMethod: event.target.value as ExpensePayment })
                }
                className={SELECT}
              >
                {PAYMENTS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_LABEL[method]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div>
            <Button type="submit" className="rounded-xl" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : !rows ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando gastos" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Concepto
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Monto
                </th>
                <th scope="col" className="px-4 py-3 text-left font-normal">
                  Pago
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Ningún gasto en este mes.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatSpentOn(row.spentOn)}</td>
                    <td className="px-4 py-3">{row.concept}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatMoney(row.amountCents)}</td>
                    <td className="px-4 py-3">{PAYMENT_LABEL[row.paymentMethod]}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className={cn("rounded-md px-2 py-1 text-muted-foreground hover:text-foreground", FOCUS)}
                        disabled={busy}
                        onClick={() => {
                          setFormError(null);
                          setDraft({
                            id: row.id,
                            spentOn: row.spentOn,
                            pesos: String(row.amountCents / 100),
                            concept: row.concept,
                            paymentMethod: row.paymentMethod,
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={cn("rounded-md px-2 py-1 text-muted-foreground hover:text-destructive", FOCUS)}
                        disabled={busy}
                        onClick={() => onDelete(row)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
