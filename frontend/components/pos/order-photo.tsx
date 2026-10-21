"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { orderPhotoFileUrl } from "@/lib/pos-api";

export function PhotoZoom({
  src,
  full,
  className,
  onThumbError,
}: {
  src: string;
  full?: string;
  className?: string;
  onThumbError?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver foto en grande"
        className="block w-fit cursor-zoom-in rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image bajaría el cuerpo por la función */}
        <img src={src} alt="" onError={onThumbError} className={className ?? "h-16 w-16 rounded-lg object-cover"} />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        aria-label="Foto de observaciones"
        className="m-auto bg-transparent p-0 backdrop:bg-foreground/70"
      >
        {open && (
          <div className="relative">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar foto"
              className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <X className="size-4" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- el 302 no lleva crossOrigin; si no Chrome marca CORS */}
            <img
              src={full ?? src}
              alt="Foto de observaciones"
              className="max-h-[85dvh] max-w-[min(92vw,42rem)] rounded-lg object-contain"
            />
          </div>
        )}
      </dialog>
    </>
  );
}

export function OrderPhoto({ photoId, className }: { photoId: string; className?: string }) {
  const full = orderPhotoFileUrl(photoId);
  const [src, setSrc] = useState<string | null>(orderPhotoFileUrl(photoId, "thumb"));
  if (!src) return null;
  return (
    <PhotoZoom
      src={src}
      full={full}
      className={className}
      onThumbError={() => setSrc((current) => (current === full ? null : full))}
    />
  );
}
