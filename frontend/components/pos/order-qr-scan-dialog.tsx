"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CameraOff, Loader2, X } from "lucide-react";
import { folioFromQrPayload } from "@/lib/order-folio-qr";

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permiso de cámara denegado. Actívalo en Ajustes del navegador e inténtalo de nuevo.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No se encontró una cámara en este equipo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "La cámara está en uso por otra app. Ciérrala e inténtalo de nuevo.";
  }
  return err instanceof Error && err.message ? err.message : "No se pudo abrir la cámara.";
}

const subscribeNoop = () => () => {};

function stopStream(stream: MediaStream | null, video: HTMLVideoElement | null) {
  stream?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este dispositivo no permite usar la cámara.");
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("No se pudo abrir la cámara.");
}

function waitForDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (video.videoWidth > 0 || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("loadeddata", done);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("loadeddata", done);
    window.setTimeout(resolve, 1500);
  });
}

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function nativeDetector(): NativeDetector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => NativeDetector })
    .BarcodeDetector;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function paintFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  if (canvas.width !== dw || canvas.height !== dh) {
    canvas.width = dw;
    canvas.height = dh;
  }
  ctx.drawImage(video, 0, 0, dw, dh);
  return true;
}

export function OrderQrScanDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (folio: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;

    const video = videoRef.current;
    let stopped = false;
    let stream: MediaStream | null = null;

    const run = async () => {
      setError(null);
      setNotice(null);
      setStarting(true);
      if (!video) throw new Error("No se pudo mostrar la cámara.");

      const [{ BinaryBitmap, HybridBinarizer, QRCodeReader }, { HTMLCanvasElementLuminanceSource }] = await Promise.all([
        import("@zxing/library"),
        import("@zxing/library/esm/browser"),
      ]);
      if (stopped) return;

      stream = await openCamera();
      if (stopped) {
        stopStream(stream, video);
        return;
      }
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.srcObject = stream;
      await video.play();
      await waitForDimensions(video);
      if (stopped) return;
      setStarting(false);

      const reader = new QRCodeReader();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar el lector de QR.");
      const native = nativeDetector();
      let lastForeign = "";

      while (!stopped) {
        let text: string | null = null;
        if (video.videoWidth > 0) {
          if (native) {
            try {
              const codes = await native.detect(video);
              text = Array.isArray(codes) ? (codes[0]?.rawValue ?? null) : null;
            } catch {
              text = null;
            }
          }
          if (!text && paintFrame(video, canvas, ctx)) {
            try {
              const source = new HTMLCanvasElementLuminanceSource(canvas, true);
              const result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)));
              text = result.getText();
            } catch {
              text = null;
            } finally {
              reader.reset();
            }
          }
        }

        if (text && !stopped) {
          const folio = folioFromQrPayload(text);
          if (folio) {
            stopped = true;
            stopStream(stream, video);
            onScanRef.current(folio);
            return;
          }
          if (text !== lastForeign) {
            lastForeign = text;
            setNotice("Ese QR no es un número de orden.");
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    };

    void run().catch((err: unknown) => {
      if (stopped) return;
      setStarting(false);
      stopStream(stream, video);
      setError(cameraError(err));
    });

    return () => {
      stopped = true;
      stopStream(stream, video);
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scan-title"
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
    >
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="qr-scan-title" className="font-semibold tracking-tight">
            Escanear ticket
          </h2>
          <p className="text-xs text-white/70">Apunta al QR del ticket y mantenlo quieto.</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="inline-flex size-8 items-center justify-center rounded-full text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          aria-label="Vista de la cámara"
        />
        {starting && !error && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Abriendo cámara…
          </p>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center">
            <CameraOff className="size-8 text-white/70" aria-hidden />
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          </div>
        )}
        {!error && !starting && (
          <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white" />
        )}
        {notice && (
          <p role="status" className="absolute inset-x-4 bottom-6 rounded-xl bg-black/80 px-3 py-2 text-center text-sm">
            {notice}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
