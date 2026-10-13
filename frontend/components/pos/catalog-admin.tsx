"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createService, deleteService, fetchServices, updateService, type ServiceInput } from "@/lib/pos-api";
import { CATEGORIES, formatMoney, UNITS, type Category, type Service, type Unit } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { NAME_MAX, sanitizeText } from "@/lib/validation";
import { usePos } from "./pos-provider";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground aria-invalid:border-destructive " +
  FOCUS;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

type FormState = { name: string; category: Category; unit: Unit; price: string };

const PRICE_MAX_DIGITS = 5;

const toForm = (s: Service): FormState => ({
  name: s.name,
  category: s.category,
  unit: s.unit,
  price: String(Math.round(s.priceCents / 100)),
});

/** Pesos enteros positivos de hasta 5 cifras → centavos; null si no es válido. */
function parsePriceCents(value: string): number | null {
  if (!new RegExp(`^[0-9]{1,${PRICE_MAX_DIGITS}}$`).test(value)) return null;
  const pesos = Number(value);
  return pesos > 0 ? pesos * 100 : null;
}

function toInput(f: FormState): ServiceInput | string {
  const name = sanitizeText(f.name, NAME_MAX).trim().replace(/\s+/g, " ");
  if (!name) return "El nombre es obligatorio.";
  const priceCents = parsePriceCents(f.price);
  if (priceCents === null) return "Precio inválido: solo pesos enteros, de 1 a 99999.";
  return { name, category: f.category, unit: f.unit, priceCents };
}

export function CatalogAdmin() {
  const { withAuth, setServices } = usePos();
  const [list, setList] = useState<Service[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    withAuth((t) => fetchServices(t, true)).then(
      (s) => !cancelled && setList(s),
      (e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : "No se pudo cargar el catálogo."),
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  const commit = (saved: Service) => {
    const prev = list ?? [];
    const next = prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
    setList(next);
    setServices(next);
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="catalog-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Administración</p>
          <h1 id="catalog-title" className="text-2xl font-semibold tracking-tight">
            Catálogo de servicios
          </h1>
        </div>
        <Button
          variant={adding ? "outline" : "default"}
          className="h-10 rounded-xl"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          disabled={!list}
        >
          {adding ? <X aria-hidden /> : <Plus aria-hidden />}
          {adding ? "Cancelar" : "Nuevo servicio"}
        </Button>
      </div>

      {adding && (
        <ServiceForm
          initial={{ name: "", category: "Prendas", unit: "pza", price: "" }}
          submitLabel="Crear servicio"
          onSubmit={async (input) => {
            commit(await withAuth((t) => createService(t, input)));
            setAdding(false);
          }}
        />
      )}

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : !list ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando catálogo" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((s) => (
            <ServiceRow
              key={s.id}
              service={s}
              onSave={async (patch) => commit(await withAuth((t) => updateService(t, s.id, patch)))}
              onDelete={async () => {
                await withAuth((t) => deleteService(t, s.id));
                const next = list.filter((x) => x.id !== s.id);
                setList(next);
                setServices(next);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ServiceRow({
  service,
  onSave,
  onDelete,
}: {
  service: Service;
  onSave: (patch: Partial<ServiceInput & { active: boolean }>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      setConfirming(false);
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ active: !service.active });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li>
        <ServiceForm
          initial={toForm(service)}
          submitLabel="Guardar cambios"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onSave(input);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3", !service.active && "opacity-60")}>
      <span className="w-10 font-mono text-xs text-muted-foreground">{service.id}</span>
      <span className="min-w-40 flex-1 text-sm font-medium">{service.name}</span>
      <span className="w-24 text-xs text-muted-foreground">{service.category}</span>
      <span className="w-28 text-right font-mono text-sm">
        {formatMoney(service.priceCents)}
        <span className="text-xs text-muted-foreground"> /{service.unit}</span>
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button size="sm" variant={service.active ? "outline" : "default"} disabled={busy} onClick={() => void toggleActive()}>
          {service.active ? "Desactivar" : "Activar"}
        </Button>
        {confirming ? (
          <>
            <Button size="sm" className="bg-destructive text-primary-foreground hover:bg-destructive/90" disabled={busy} onClick={() => void remove()}>
              Confirmar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              No
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden /> Eliminar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function ServiceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (input: ServiceInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = toInput(form);
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem_8rem]">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Nombre</span>
          <input
            autoFocus
            maxLength={NAME_MAX}
            value={form.name}
            onChange={(e) => set({ name: sanitizeText(e.target.value, NAME_MAX) })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Categoría</span>
          <select value={form.category} onChange={(e) => set({ category: e.target.value as Category })} className={INPUT}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Unidad</span>
          <select value={form.unit} onChange={(e) => set({ unit: e.target.value as Unit })} className={INPUT}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Precio (MXN)</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={PRICE_MAX_DIGITS}
            placeholder="180"
            value={form.price}
            onChange={(e) => set({ price: e.target.value.replace(/\D/g, "").slice(0, PRICE_MAX_DIGITS) })}
            className={cn(INPUT, "font-mono")}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          <Save aria-hidden /> {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
