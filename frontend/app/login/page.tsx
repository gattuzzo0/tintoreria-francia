import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { INTRO_AUDIO_SRC, INTRO_LOGO_SRC } from "@/lib/login-intro";

export const metadata = { title: "Iniciar sesión · Tintorería Francia" };

export default function LoginPage() {
  return (
    <>
      {/* Precarga temprana del PNG/audio de la intro (Next Image del login usa otra URL). */}
      <link rel="preload" href={INTRO_LOGO_SRC} as="image" />
      <link rel="preload" href={INTRO_AUDIO_SRC} as="audio" type="audio/mpeg" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
