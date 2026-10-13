const INTRO_FLAG = "tf-login-intro";

export const INTRO_LOGO_SRC = "/logo-francia.png";
export const INTRO_AUDIO_SRC = "/intro-steam.mp3";

/** Máximo a esperar assets antes de arrancar la intro (evita colgarse). */
const PRELOAD_TIMEOUT_MS = 4000;

let preloadPromise: Promise<void> | null = null;

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const done = () => resolve();
      if (typeof img.decode === "function") {
        img.decode().then(done).catch(done);
      } else {
        done();
      }
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

function loadAudio(src: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "auto";
    const done = () => {
      audio.removeEventListener("canplaythrough", done);
      audio.removeEventListener("error", done);
      resolve();
    };
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.src = src;
    audio.load();
  });
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    promise.finally(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Precarga logo + audio de la intro (idempotente; llamar desde la pantalla de login). */
export function preloadLoginIntroAssets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!preloadPromise) {
    preloadPromise = withTimeout(
      Promise.all([loadImage(INTRO_LOGO_SRC), loadAudio(INTRO_AUDIO_SRC)]).then(() => undefined),
      PRELOAD_TIMEOUT_MS,
    );
  }
  return preloadPromise;
}

/** Lo llama el login justo antes de entrar; la intro se muestra una sola vez por inicio de sesión. */
export function queueLoginIntro(): void {
  sessionStorage.setItem(INTRO_FLAG, "1");
}

export function isLoginIntroQueued(): boolean {
  return (
    sessionStorage.getItem(INTRO_FLAG) === "1" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function clearLoginIntro(): void {
  sessionStorage.removeItem(INTRO_FLAG);
}
