"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck, User, UserMinus, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { createAdmin, fetchAdmins, revokeStaff, type Admin, type StaffRole } from "@/lib/admins-api";
import { ApiHttpError } from "@/lib/api-client";
import { formatDate } from "@/lib/pos-data";
import { isValidStaffPhone } from "@/lib/staff-login";
import { cn } from "@/lib/utils";
import { PHONE_DIGITS, sanitizePhoneInput } from "@/lib/validation";
import { usePos } from "./pos-provider";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm placeholder:text-muted-foreground aria-invalid:border-destructive " +
  FOCUS;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

const ROLES: { id: StaffRole; label: string; hint: string }[] = [
  { id: "empleado", label: "Empleado", hint: "Venta, órdenes y clientes." },
  { id: "admin", label: "Administrador", hint: "Acceso completo: reportes, catálogo y personal." },
];

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

type Errors = { phone?: string; password?: string; confirm?: string; form?: string };

function validate(phone: string, password: string, confirm: string): Errors {
  const errors: Errors = {};
  if (!isValidStaffPhone(phone)) errors.phone = `Debe tener exactamente ${PHONE_DIGITS} dígitos.`;
  if (password.length < PASSWORD_MIN) errors.password = `Mínimo ${PASSWORD_MIN} caracteres.`;
  else if (password.trim() !== password) errors.password = "Sin espacios al inicio o al final.";
  if (confirm !== password) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

export function AdminsView() {
  const { withAuth } = usePos();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [role, setRole] = useState<StaffRole>("empleado");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<{ userId: string; message: string } | null>(null);

  const onRevoke = async (userId: string) => {
    setRevokingId(userId);
    setRevokeError(null);
    try {
      await withAuth((t) => revokeStaff(t, userId));
      setAdmins((prev) => (prev ?? []).filter((a) => a.userId !== userId));
      setConfirmingId(null);
    } catch (err) {
      setRevokeError({ userId, message: err instanceof Error ? err.message : "No se pudo revocar el acceso." });
    } finally {
      setRevokingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    withAuth(fetchAdmins).then(
      (list) => !cancelled && setAdmins(list),
      (e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : "No se pudo cargar la lista."),
    );
    return () => {
      cancelled = true;
    };
  }, [withAuth]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(phone, password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const created = await withAuth((t) => createAdmin(t, { phone, password, role }));
      setAdmins((prev) => [...(prev ?? []), created]);
      setCreatedId(created.userId);
      setPhone("");
      setPassword("");
      setConfirm("");
      setShow(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear el usuario.";
      setErrors(err instanceof ApiHttpError && err.status === 409 ? { phone: msg } : { form: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="admins-title">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Accesos</p>
        <h1 id="admins-title" className="text-2xl font-semibold tracking-tight">
          Administradores
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          <div>
            <p className={LABEL}>Alta</p>
            <h2 className="text-lg font-semibold tracking-tight">Nuevo usuario</h2>
            <p className="mt-1 text-sm text-muted-foreground">Podrá iniciar sesión de inmediato con su teléfono.</p>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className={cn(LABEL, "mb-1.5")}>Rol</legend>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={role === r.id}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "h-10 rounded-xl border text-sm font-medium transition-colors",
                    FOCUS,
                    role === r.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.id === role)?.hint}</p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="admin-phone" className={LABEL}>
                Teléfono (usuario)
              </label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {phone.length}/{PHONE_DIGITS}
              </span>
            </div>
            <input
              id="admin-phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              autoComplete="off"
              maxLength={PHONE_DIGITS}
              placeholder="5512345678"
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby="admin-phone-error"
              className={cn(INPUT, "font-mono tracking-wider")}
            />
            <p id="admin-phone-error" role="alert" className="min-h-4 text-xs text-destructive">
              {errors.phone}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="admin-password" className={LABEL}>
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className={cn("inline-flex min-h-8 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:text-foreground", FOCUS)}
                aria-pressed={show}
              >
                {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <input
              id="admin-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby="admin-password-error"
              className={INPUT}
            />
            <p id="admin-password-error" role="alert" className="min-h-4 text-xs text-destructive">
              {errors.password}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-confirm" className={LABEL}>
              Confirmar contraseña
            </label>
            <input
              id="admin-confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby="admin-confirm-error"
              className={INPUT}
            />
            <p id="admin-confirm-error" role="alert" className="min-h-4 text-xs text-destructive">
              {errors.confirm}
            </p>
          </div>

          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}
          <Button type="submit" className="rounded-xl" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Crear {role === "admin" ? "administrador" : "empleado"}
          </Button>
        </form>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Personal con acceso</h2>
          </div>
          {loadError ? (
            <p role="alert" className="px-4 py-6 text-sm text-destructive">
              {loadError}
            </p>
          ) : !admins ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Cargando personal" />
            </div>
          ) : (
            <ul className="divide-y">
              {admins.map((a) => (
                <li
                  key={a.userId}
                  className={cn("flex flex-wrap items-center gap-3 px-4 py-3", a.userId === createdId && "bg-accent/60")}
                >
                  {a.role === "admin" ? (
                    <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="flex-1 font-mono text-sm font-medium whitespace-nowrap">{a.phone ?? "—"}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      a.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {a.role === "admin" ? "Admin" : "Empleado"}
                  </span>
                  {a.userId === myId && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tracking-[0.14em]">TÚ</span>
                  )}
                  {a.userId === createdId && (
                    <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-primary-foreground">
                      NUEVO
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">{formatDate(a.createdAt)}</span>
                  {a.userId !== myId &&
                    (confirmingId === a.userId ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">¿Revocar acceso?</span>
                        <Button
                          size="sm"
                          className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                          disabled={revokingId === a.userId}
                          onClick={() => void onRevoke(a.userId)}
                        >
                          {revokingId === a.userId && <Loader2 className="animate-spin" aria-hidden />}
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revokingId === a.userId}
                          onClick={() => setConfirmingId(null)}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Revocar acceso de ${a.phone ?? "usuario"}`}
                        onClick={() => {
                          setRevokeError(null);
                          setConfirmingId(a.userId);
                        }}
                      >
                        <UserMinus aria-hidden /> Revocar
                      </Button>
                    ))}
                  {revokeError?.userId === a.userId && (
                    <p role="alert" className="w-full text-xs text-destructive">
                      {revokeError.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
