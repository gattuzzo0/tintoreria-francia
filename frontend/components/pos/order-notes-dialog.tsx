"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CircleAlert, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, type Order } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import { NOTES_MAX, sanitizeText } from "@/lib/validation";
import { OrderPhoto } from "./order-photo";
import { usePos } from "./pos-provider";

export function OrderNotesDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { addNote, addOrderPhoto, getCustomer } = usePos();
  const photoInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (order && !dialog.open) dialog.showModal();
    if (!order && dialog.open) dialog.close();
  }, [order]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = sanitizeText(text, NOTES_MAX).trim();
    if (!order || !body) return;
    setBusy(true);
    setError(null);
    try {
      await addNote(order.folio, body);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la nota.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={() => {
        setText("");
        setError(null);
        setPhotoBusy(false);
        onClose();
      }}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="notes-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 backdrop:bg-foreground/50 backdrop:backdrop-blur-sm"
    >
      {order && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-start gap-3 border-b px-5 py-4">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground">
              <CircleAlert className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="notes-title" className="font-semibold tracking-tight">
                Notas · Orden #{order.folio}
              </h2>
              <p className="truncate text-xs text-muted-foreground">{getCustomer(order.customerId)?.name ?? "—"}</p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto px-5 py-4">
            {order.notes && (
              <div className="rounded-xl border bg-muted/60 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Observaciones al recibir · {formatDate(order.createdAt)}
                </p>
                <p className="text-sm">{order.notes}</p>
                {order.photoId && <OrderPhoto photoId={order.photoId} className="mt-2 h-24 w-24 rounded-lg object-cover" />}
              </div>
            )}
            {!order.notes && order.photoId && (
              <div className="rounded-xl border bg-muted/60 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Observaciones al recibir · {formatDate(order.createdAt)}
                </p>
                <OrderPhoto photoId={order.photoId} className="mt-2 h-24 w-24 rounded-lg object-cover" />
              </div>
            )}
            {order.staffNotes.map((n) => (
              <div key={n.id} className="rounded-xl border border-warning bg-warning/10 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {formatDate(n.createdAt)}
                </p>
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
            {!order.notes && !order.photoId && order.staffNotes.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Esta orden aún no tiene notas.</p>
            )}
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-2 border-t px-5 py-4">
            <div className="flex items-center justify-between">
              <label htmlFor="staff-note" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Nueva nota
              </label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {text.length}/{NOTES_MAX}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <textarea
                id="staff-note"
                rows={3}
                autoFocus
                maxLength={NOTES_MAX}
                value={text}
                onChange={(e) => setText(sanitizeText(e.target.value, NOTES_MAX))}
                placeholder="Se rompió un botón, mancha que no salió…"
                className={cn(
                  "min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground sm:text-sm",
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                )}
              />
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                disabled={photoBusy || busy}
                aria-label="Tomar foto o subir imagen"
                title="Tomar foto o subir imagen"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
              >
                {photoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !order) return;
                  setPhotoBusy(true);
                  setError(null);
                  void addOrderPhoto(order.folio, file)
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
                    })
                    .finally(() => setPhotoBusy(false));
                }}
              />
            </div>
            {(order.photoIds ?? []).length > 1 && (
              <div className="flex flex-wrap gap-2">
                {(order.photoIds ?? []).slice(1).map((id) => (
                  <OrderPhoto key={id} photoId={id} className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="rounded-xl" disabled={busy || !text.trim()}>
              Guardar nota
            </Button>
          </form>
        </div>
      )}
    </dialog>
  );
}
