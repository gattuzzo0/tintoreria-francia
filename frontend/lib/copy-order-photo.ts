import { apiFetch } from "./api-client";

/** PNG para el portapapeles. URL firmada directo a R2: el 302 de /file no entra en canvas. */
export function orderPhotoPng(token: string, photoId: string): Promise<Blob> {
  return apiFetch<{ url: string }>(`/api/orders/photos/${encodeURIComponent(photoId)}/url`, token).then(({ url }) =>
    pngFromUrl(url),
  );
}

function pngFromUrl(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // ponytail: cap longest edge. Full camera PNG blows the clipboard (~3MB) and WhatsApp recompresses anyway.
      const edge = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = edge > 1280 ? 1280 / edge : 1;
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo copiar la foto."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo copiar la foto."))), "image/png");
    };
    img.onerror = () => reject(new Error("No se pudo copiar la foto."));
    img.src = url;
  });
}
