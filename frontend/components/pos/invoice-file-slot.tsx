"use client";

import { useRef, useState } from "react";
import { FileCode, FileText, Loader2 } from "lucide-react";
import { invoiceFileError, type InvoiceFileKind } from "@/lib/invoice-file";
import { openInvoiceFile, uploadInvoiceFile } from "@/lib/pos-api";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-provider";

const ACCEPT: Record<InvoiceFileKind, string> = {
  pdf: ".pdf,application/pdf",
  xml: ".xml,text/xml,application/xml",
};

export function InvoiceFileSlot({
  folio,
  kind,
  loaded,
  onLoaded,
}: {
  folio: number;
  kind: InvoiceFileKind;
  loaded: boolean;
  onLoaded: () => void;
}) {
  const { withAuth } = usePos();
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind.toUpperCase();
  const Icon = kind === "pdf" ? FileText : FileCode;

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    const invalid = await invoiceFileError(kind, file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      await withAuth((token) => uploadInvoiceFile(token, folio, kind, file));
      onLoaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        aria-label={loaded ? `Reemplazar ${label} de la orden ${folio}` : `Cargar ${label} de la orden ${folio}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) {
            depth.current = 0;
            setOver(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          const files = event.dataTransfer.files;
          if (files.length !== 1) {
            setError("Suelta un solo archivo.");
            return;
          }
          void take(files[0]);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
          loaded ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
          over && "invoice-drop-target scale-110 border-dashed border-primary bg-primary text-primary-foreground",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
        {over ? "Soltar" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void take(file);
        }}
      />
      {loaded && !busy && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
          onClick={() => {
            setError(null);
            void withAuth((token) => openInvoiceFile(token, folio, kind)).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "No se pudo abrir el archivo.");
            });
          }}
        >
          Ver
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs whitespace-nowrap text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
