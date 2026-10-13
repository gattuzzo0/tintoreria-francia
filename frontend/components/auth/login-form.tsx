"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/pos/brand-mark";
import { BRANCHES, type Branch, saveBranch } from "@/lib/branches";
import { queueLoginIntro } from "@/lib/login-intro";
import { Button } from "@/components/ui/button";
import { isValidStaffPhone, staffPhoneToLoginEmail } from "@/lib/staff-login";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PHONE_DIGITS, sanitizePhoneInput } from "@/lib/validation";
import { useAuth } from "./auth-provider";

const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState<Branch | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidStaffPhone(phone)) {
      setError(`El teléfono debe tener exactamente ${PHONE_DIGITS} dígitos.`);
      return;
    }
    if (!password) {
      setError("Escribe tu contraseña.");
      return;
    }
    if (!branch) {
      setError("Elige una sucursal.");
      return;
    }
    setBusy(true);
    const result = await signIn(staffPhoneToLoginEmail(phone), password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.role) {
      setError("Tu usuario no tiene acceso al punto de venta.");
      return;
    }
    saveBranch(branch);
    queueLoginIntro();
    router.replace(safeNext(params.get("next")));
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-6 shadow-[0_20px_50px_-30px] shadow-foreground/25"
        aria-labelledby="login-title"
      >
        <BrandMark />
        <div>
          <p className={LABEL}>Acceso de personal</p>
          <h1 id="login-title" className="text-xl font-semibold tracking-tight">
            Iniciar sesión
          </h1>
        </div>
        {!isSupabaseConfigured && (
          <p role="alert" className="rounded-xl border border-dashed p-3 text-sm text-destructive">
            Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="phone" className={LABEL}>
              Teléfono
            </label>
            <span className="font-mono text-[11px] text-muted-foreground">
              {phone.length}/{PHONE_DIGITS}
            </span>
          </div>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            autoComplete="username"
            placeholder="5512345678"
            maxLength={PHONE_DIGITS}
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            disabled={!isSupabaseConfigured || busy}
            className={`${INPUT} font-mono tracking-wider`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className={LABEL}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!isSupabaseConfigured || busy}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="branch" className={LABEL}>
            Sucursal
          </label>
          <select
            id="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value as Branch | "")}
            disabled={!isSupabaseConfigured || busy}
            required
            className={INPUT}
          >
            <option value="" disabled>
              Elige sucursal…
            </option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <p role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
        <Button type="submit" size="lg" className="rounded-xl" disabled={!isSupabaseConfigured || busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Entrar
        </Button>
      </form>
    </main>
  );
}
