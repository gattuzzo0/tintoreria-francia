"use client";

import { useState } from "react";
import { BRANCHES, type Branch, readBranch, saveBranch } from "@/lib/branches";
import { Button } from "@/components/ui/button";

const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

/** Bloquea el POS hasta elegir sucursal (sesión vieja sin branch en storage). */
export function BranchGate({ children }: { children: React.ReactNode }) {
  const [branch, setBranch] = useState<Branch | "">(() => readBranch() ?? "");
  const [ready, setReady] = useState(() => Boolean(readBranch()));

  if (ready) return children;

  return (
    <div className="flex min-h-[50dvh] items-center justify-center px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border bg-card p-6 shadow-[0_20px_50px_-30px] shadow-foreground/25"
        onSubmit={(e) => {
          e.preventDefault();
          if (!branch) return;
          saveBranch(branch);
          setReady(true);
        }}
      >
        <div>
          <p className={LABEL}>Sesión</p>
          <h2 className="text-lg font-semibold tracking-tight">Elige la sucursal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Falta la sucursal para cobrar. Se guarda hasta cerrar sesión.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Sucursal</span>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value as Branch | "")}
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
        </label>
        <Button type="submit" size="lg" className="rounded-xl" disabled={!branch}>
          Continuar
        </Button>
      </form>
    </div>
  );
}
