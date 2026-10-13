const INTRO_FLAG = "tf-login-intro";

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
