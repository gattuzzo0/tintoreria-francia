"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiHttpError } from "@/lib/api-client";
import { fetchCustomerStats, type CustomerStat } from "@/lib/pos-api";
import { formatMoney } from "@/lib/pos-data";
import { readBranch } from "@/lib/branches";
import { cn } from "@/lib/utils";
import {
  PHONE_DIGITS,
  SEARCH_MAX,
  sanitizeNameInput,
  sanitizePhoneInput,
  sanitizeText,
  validateCustomer,
} from "@/lib/validation";
import { usePos } from "./pos-provider";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground aria-invalid:border-destructive " +
  FOCUS;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export function CustomersView({
  prefillPhone,
  onReturnToSale,
}: {
  prefillPhone: string | null;
  onReturnToSale: () => void;
}) {
  const { customers, addCustomer, updateDraft, withAuth } = usePos();
  const fromSale = Boolean(prefillPhone);
  const [stats, setStats] = useState<Map<string, CustomerStat>>(() => new Map());

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(fromSale);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(() => sanitizePhoneInput(prefillPhone ?? ""));
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [newId, setNewId] = useState<string | null>(null);

  useEffect(() => {
    const branch = readBranch();
    if (!branch) return;
    let cancelled = false;
    void withAuth((token) => fetchCustomerStats(token, branch))
      .then((rows) => {
        if (!cancelled) setStats(new Map(rows.map((row) => [row.customerId, row])));
      })
      .catch(() => {
        if (!cancelled) setStats(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [withAuth]);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\s/g, "");
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, "").includes(qDigits))
    : customers;

  const toggleForm = () => {
    setOpen((v) => !v);
    setErrors({});
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCustomer(
      name,
      phone,
      customers.map((c) => c.phone),
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    let created;
    try {
      created = await addCustomer({ name: result.name, phone: result.phone });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el cliente.";
      setErrors(err instanceof ApiHttpError && err.status === 409 ? { phone: msg } : { name: msg });
      return;
    } finally {
      setBusy(false);
    }
    if (fromSale) {
      updateDraft({ customerId: created.id });
      onReturnToSale();
      return;
    }
    setNewId(created.id);
    setOpen(false);
    setQuery("");
    setName("");
    setPhone("");
    setErrors({});
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="customers-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Directorio</p>
          <h1 id="customers-title" className="text-2xl font-semibold tracking-tight">
            Clientes
          </h1>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <div className="relative flex-1 md:w-72 md:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              aria-label="Buscar cliente"
              placeholder="Nombre o teléfono…"
              value={query}
              onChange={(e) => setQuery(sanitizeText(e.target.value, SEARCH_MAX))}
              className={cn(INPUT, "pl-9")}
            />
          </div>
          <Button
            variant={open ? "outline" : "default"}
            className="h-10 rounded-xl"
            onClick={toggleForm}
            aria-expanded={open}
            aria-controls="new-customer-form"
          >
            {open ? <X aria-hidden /> : <Plus aria-hidden />}
            {open ? "Cancelar" : "Nuevo cliente"}
          </Button>
        </div>
      </div>

      {open && (
        <form id="new-customer-form" noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <div>
            <p className={LABEL}>Alta</p>
            <h2 className="text-lg font-semibold tracking-tight">Registrar nuevo cliente</h2>
            {fromSale && (
              <p className="mt-1 text-sm text-muted-foreground">
                Teléfono tomado de la venta en curso. Captura el nombre para volver al ticket con el cliente asignado.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="cust-name" className={LABEL}>
                Nombre completo
              </label>
              <input
                id="cust-name"
                autoFocus
                autoComplete="off"
                placeholder="Ej. Mariana López Ortega"
                value={name}
                onChange={(e) => setName(sanitizeNameInput(e.target.value))}
                aria-invalid={Boolean(errors.name)}
                aria-describedby="cust-name-error"
                className={INPUT}
              />
              <p id="cust-name-error" role="alert" className="min-h-4 text-xs text-destructive">
                {errors.name}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 md:w-56">
              <div className="flex items-center justify-between">
                <label htmlFor="cust-phone" className={LABEL}>
                  Teléfono
                </label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {phone.length}/{PHONE_DIGITS}
                </span>
              </div>
              <input
                id="cust-phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                autoComplete="off"
                placeholder="5512345678"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby="cust-phone-error"
                className={cn(INPUT, "font-mono tracking-wider")}
              />
              <p id="cust-phone-error" role="alert" className="min-h-4 text-xs text-destructive">
                {errors.phone}
              </p>
            </div>
          </div>
          <Button type="submit" className="self-start rounded-xl" disabled={busy}>
            {fromSale ? "Guardar y volver a la venta" : "Guardar cliente"}
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-normal">
                Cliente
              </th>
              <th scope="col" className="hidden px-4 py-3 text-left font-normal md:table-cell">
                Contacto
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                Órdenes
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right font-normal sm:table-cell">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  Sin clientes que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const stat = stats.get(c.id);
                const orderCount = stat?.orders ?? 0;
                const activeCount = stat?.active ?? 0;
                const spent = stat?.spentCents ?? 0;
                return (
                  <tr key={c.id} className={cn(c.id === newId && "bg-accent/60")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] text-accent-foreground">
                          {initials(c.name)}
                        </span>
                        <span className="font-medium">{c.name}</span>
                        {c.id === newId && (
                          <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-primary-foreground">
                            NUEVO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div className="flex flex-col gap-0.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <Phone className="size-3.5" aria-hidden /> {c.phone}
                        </span>
                        {c.email && (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Mail className="size-3.5" aria-hidden /> {c.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono">{orderCount}</span>
                      <span className="block text-xs text-muted-foreground">{activeCount} activas</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono sm:table-cell">{formatMoney(spent)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
