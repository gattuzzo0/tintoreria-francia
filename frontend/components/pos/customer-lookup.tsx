"use client";

import { useId, useState } from "react";
import { Search, UserCheck, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiHttpError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  digitsOnly,
  sanitizeNameInput,
  sanitizePhoneInput,
  validateCustomer,
  PHONE_DIGITS,
} from "@/lib/validation";
import { usePos } from "./pos-provider";

const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground aria-invalid:border-destructive " +
  FOCUS;

type LookupStatus = "idle" | "invalid" | "missing";

export function CustomerLookup({
  onRegisterPhone,
  className,
  autoFocus = false,
  /** Móvil: solo input+buscar en la fila; label/Nuevo van debajo o en icono. */
  compact = false,
}: {
  onRegisterPhone: (phone: string) => void;
  className?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const { draft, customers, updateDraft, addCustomer, getCustomer } = usePos();
  const customer = draft.customerId ? getCustomer(draft.customerId) : undefined;
  const uid = useId();
  const nameId = `${uid}-name`;
  const phoneId = `${uid}-phone`;
  const resultId = `${uid}-result`;
  const nameErrId = `${uid}-name-err`;
  const phoneErrId = `${uid}-phone-err`;

  const [phone, setPhone] = useState(() => (customer ? digitsOnly(customer.phone) : ""));
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);

  const runLookup = (digits: string) => {
    if (digits.length !== PHONE_DIGITS) {
      setStatus(digits.length === 0 ? "idle" : "invalid");
      updateDraft({ customerId: null });
      return;
    }
    const found = customers.find((c) => digitsOnly(c.phone) === digits);
    if (found) {
      setStatus("idle");
      updateDraft({ customerId: found.id });
    } else {
      setStatus("missing");
      updateDraft({ customerId: null });
    }
  };

  const onPhoneChange = (value: string) => {
    const digits = sanitizePhoneInput(value);
    setPhone(digits);
    if (draft.customerId) updateDraft({ customerId: null });
    if (digits.length === PHONE_DIGITS) runLookup(digits);
    else setStatus("idle");
  };

  const onLookup = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(phone);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCustomer(
      newName,
      newPhone,
      customers.map((c) => c.phone),
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      const created = await addCustomer({ name: result.name, phone: result.phone });
      updateDraft({ customerId: created.id });
      setPhone(digitsOnly(result.phone));
      setStatus("idle");
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el cliente.";
      setErrors(err instanceof ApiHttpError && err.status === 409 ? { phone: msg } : { name: msg });
    } finally {
      setBusy(false);
    }
  };

  const toggleCreating = () => {
    setCreating((v) => !v);
    setErrors({});
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {!compact && (
        <div className="flex items-center justify-between">
          <label htmlFor={creating ? nameId : phoneId} className={LABEL}>
            Cliente
          </label>
          <button
            type="button"
            onClick={toggleCreating}
            className={cn("inline-flex min-h-8 items-center gap-1 rounded px-1 text-xs font-medium text-primary hover:underline", FOCUS)}
          >
            {creating ? (
              "Cancelar"
            ) : (
              <>
                <UserPlus className="size-3.5" aria-hidden /> Nuevo
              </>
            )}
          </button>
        </div>
      )}

      {creating ? (
        <form noValidate onSubmit={(e) => void onCreate(e)} className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
          <input
            id={nameId}
            className={INPUT}
            placeholder="Nombre completo"
            autoComplete="off"
            value={newName}
            onChange={(e) => setNewName(sanitizeNameInput(e.target.value))}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? nameErrId : undefined}
            aria-label="Nombre completo"
          />
          {errors.name && (
            <p id={nameErrId} role="alert" className="text-xs text-destructive">
              {errors.name}
            </p>
          )}
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            className={cn(INPUT, "font-mono tracking-wider")}
            placeholder="Teléfono (10 dígitos)"
            autoComplete="off"
            value={newPhone}
            onChange={(e) => setNewPhone(sanitizePhoneInput(e.target.value))}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? phoneErrId : undefined}
            aria-label="Teléfono"
          />
          {errors.phone && (
            <p id={phoneErrId} role="alert" className="text-xs text-destructive">
              {errors.phone}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 rounded-xl" disabled={busy}>
              Guardar cliente
            </Button>
            {compact && (
              <Button type="button" variant="outline" className="rounded-xl" onClick={toggleCreating}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <form noValidate onSubmit={onLookup} className={cn(!compact && "flex gap-2")}>
            <input
              id={phoneId}
              type="tel"
              autoFocus={autoFocus}
              inputMode="numeric"
              pattern="[0-9]{10}"
              className={cn(INPUT, "font-mono tracking-wider")}
              placeholder="Teléfono (10 dígitos)"
              autoComplete="off"
              aria-label="Teléfono del cliente"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              aria-invalid={status === "invalid"}
              aria-describedby={resultId}
            />
            {!compact && (
              <Button type="submit" variant="outline" size="icon-lg" className="rounded-xl" aria-label="Buscar cliente">
                <Search aria-hidden />
              </Button>
            )}
          </form>
          <div id={resultId} aria-live="polite" className="min-h-5 text-sm">
            {customer ? (
              <p className="flex items-center gap-2">
                <UserCheck className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Cliente ya registrado: <span className="font-medium">{customer.name}</span>
                </span>
              </p>
            ) : status === "missing" ? (
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <UserX className="size-4" aria-hidden />
                  Cliente no registrado aún
                </p>
                <button
                  type="button"
                  onClick={() => onRegisterPhone(phone)}
                  className={cn("inline-flex min-h-8 items-center gap-1 rounded px-1 text-xs font-medium text-primary hover:underline", FOCUS)}
                >
                  <UserPlus className="size-3.5" aria-hidden /> Dar de alta
                </button>
              </div>
            ) : status === "invalid" ? (
              <p role="alert" className="text-destructive">
                Ingresa los 10 dígitos del teléfono.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
