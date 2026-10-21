import { ApiHttpError } from "./api-client";
import { qualityLadder, shrinkBox } from "./photo-canvas-plan";

const FULL_W = 1080;
const FULL_H = 1440;
const THUMB_W = 225;
const THUMB_H = 300;
const LIMIT = 700 * 1024;
const TINY = 50;
const MAX_BYTES = 4_000_000;

export type PhotoMime = "image/webp" | "image/jpeg";

export type PreparedPhoto = {
  full: Blob;
  mime: PhotoMime;
  width: number;
  height: number;
  thumb: Blob | null;
};

function contain(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiHttpError("No se pudo preparar la foto.", 422);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  ctx.drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: PhotoMime, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/** null si toBlob falla o el resultado es diminuto. Si todos pasan el tope, devuelve el último. */
async function encode(canvas: HTMLCanvasElement, type: PhotoMime, qualities: number[]): Promise<Blob | null> {
  let last: Blob | null = null;
  for (const quality of qualities) {
    const blob = await toBlob(canvas, type, quality);
    if (!blob || blob.size < TINY) return null;
    last = blob;
    if (blob.size <= LIMIT) return blob;
  }
  return last;
}

export async function prepareOrderPhoto(file: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiHttpError("No se pudo leer la foto.", 422);
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ApiHttpError("No se pudo leer la foto.", 422);
    const thumbCanvas = contain(bitmap, THUMB_W, THUMB_H);
    let canvas = contain(bitmap, FULL_W, FULL_H);
    // WebP baja de 0.04, pero al llegar a 0.48 se cambia a JPEG.
    const webpTry = qualityLadder(0.68, 0.04, 0.42).filter((q) => q > 0.48);
    let mime: PhotoMime = "image/webp";
    let full = await encode(canvas, "image/webp", webpTry);
    if (!full || full.size > LIMIT) {
      const jpeg = await encode(canvas, "image/jpeg", qualityLadder(0.72, 0.04, 0.42));
      if (!jpeg) throw new ApiHttpError("No se pudo preparar la foto.", 422);
      full = jpeg;
      mime = "image/jpeg";
    }
    if (full.size > LIMIT && canvas.width >= 900) {
      const box = shrinkBox(canvas.width, canvas.height);
      if (box) {
        canvas = contain(bitmap, box.width, box.height);
        const smaller = await encode(canvas, "image/webp", qualityLadder(0.62, 0.05, 0.4));
        if (smaller) {
          full = smaller;
          mime = "image/webp";
        }
      }
    }
    if (full.size > MAX_BYTES) throw new ApiHttpError("La imagen debe pesar menos de 4 MB.", 422);
    const thumbRaw = await toBlob(thumbCanvas, "image/webp", 0.62);
    return {
      full,
      mime,
      width: canvas.width,
      height: canvas.height,
      thumb: thumbRaw && thumbRaw.size >= TINY ? thumbRaw : null,
    };
  } finally {
    bitmap.close();
  }
}
