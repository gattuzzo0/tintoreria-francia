"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CFDI_USES, TAX_REGIMES } from "@/lib/fiscal";
import type { Customer } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { parseFiscal, type FiscalValue } from "@/lib/validation";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const FIELD =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-base sm:text-sm aria-invalid:border-destructive " +
  FOCUS;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

export type FiscalDraft = {
  rfc: string;
  legalName: string;
  fiscalZip: string;
  taxRegime: string;
  cfdiUse: string;
};

export function fiscalDraft(value: FiscalValue): FiscalDraft {
  return {
    rfc: value.rfc ?? "",
    legalName: value.legalName ?? "",
    fiscalZip: value.fiscalZip ?? "",
    taxRegime: value.taxRegime ?? "",
    cfdiUse: value.cfdiUse ?? "",
  };
}

export function FiscalForm({
  idPrefix,
  initial,
  required,
  busy,
  submitLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  initial: FiscalDraft;
  required: boolean;
  busy: boolean;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (value: FiscalValue) => Promise<void>;
}) {
  const [rfc, setRfc] = useState(initial.rfc);
  const [legalName, setLegalName] = useState(initial.legalName);
  const [fiscalZip, setFiscalZip] = useState(initial.fiscalZip);
  const [taxRegime, setTaxRegime] = useState(initial.taxRegime);
  const [cfdiUse, setCfdiUse] = useState(initial.cfdiUse);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = parseFiscal({ rfc, legalName, fiscalZip, taxRegime, cfdiUse }, required);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    try {
      await onSubmit(parsed.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los datos fiscales.");
    }
  };

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`${idPrefix}-rfc`} className={LABEL}>
        RFC
      </label>
      <input
        id={`${idPrefix}-rfc`}
        autoFocus
        autoComplete="off"
        value={rfc}
        disabled={busy}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setRfc(e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "").slice(0, 13));
          setError(null);
        }}
        className={cn(FIELD, "font-mono tracking-wider uppercase")}
      />

      <label htmlFor={`${idPrefix}-name`} className={LABEL}>
        Nombre o razón social
      </label>
      <input
        id={`${idPrefix}-name`}
        autoComplete="off"
        value={legalName}
        disabled={busy}
        aria-invalid={Boolean(error)}
        placeholder="Como en la constancia"
        onChange={(e) => {
          setLegalName(e.target.value.toLocaleUpperCase("es-MX").slice(0, 254));
          setError(null);
        }}
        className={FIELD}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        Sin el régimen societario si es persona moral. Nombre completo si es persona física.
      </p>

      <label htmlFor={`${idPrefix}-zip`} className={LABEL}>
        Código postal fiscal
      </label>
      <input
        id={`${idPrefix}-zip`}
        inputMode="numeric"
        autoComplete="off"
        value={fiscalZip}
        disabled={busy}
        aria-invalid={Boolean(error)}
        placeholder="5 dígitos"
        onChange={(e) => {
          setFiscalZip(e.target.value.replace(/\D/g, "").slice(0, 5));
          setError(null);
        }}
        className={cn(FIELD, "font-mono tracking-wider")}
      />

      <label htmlFor={`${idPrefix}-regime`} className={LABEL}>
        Régimen fiscal
      </label>
      <select
        id={`${idPrefix}-regime`}
        value={taxRegime}
        disabled={busy}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setTaxRegime(e.target.value);
          setError(null);
        }}
        className={FIELD}
      >
        <option value="">Elige el régimen</option>
        {TAX_REGIMES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      <label htmlFor={`${idPrefix}-use`} className={LABEL}>
        Uso del CFDI
      </label>
      <select
        id={`${idPrefix}-use`}
        value={cfdiUse}
        disabled={busy}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setCfdiUse(e.target.value);
          setError(null);
        }}
        className={FIELD}
      >
        <option value="">Elige el uso</option>
        {CFDI_USES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 flex gap-2 bg-background pt-2">
        <Button type="button" variant="outline" className="flex-1 rounded-xl" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" className="flex-1 rounded-xl" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function customerFiscal(customer: Pick<Customer, "rfc" | "legalName" | "fiscalZip" | "taxRegime" | "cfdiUse">): FiscalValue {
  return {
    rfc: customer.rfc ?? null,
    legalName: customer.legalName ?? null,
    fiscalZip: customer.fiscalZip ?? null,
    taxRegime: customer.taxRegime ?? null,
    cfdiUse: customer.cfdiUse ?? null,
  };
}
