"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { clearLoginIntro, isLoginIntroQueued } from "@/lib/login-intro";
import { cn } from "@/lib/utils";

/** Animación + desvanecido = 3 s exactos. */
const INTRO_MS = 2700;
const FADE_MS = 300;
/** El siseo arranca con el chorro de vapor (.tf-intro-jet). */
const STEAM_SOUND_AT_MS = 700;

/** PRNG con semilla fija: mismas partículas en cada render (render puro). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(1966);
const between = (min: number, max: number) => min + rand() * (max - min);
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Polvo brillante que flota por toda la pantalla. */
const DUST = Array.from({ length: 30 }, () => ({
  x: `${rand() * 100}%`,
  y: `${rand() * 100}%`,
  size: `${between(1.5, 4)}px`,
  delay: `${rand() * 1.2}s`,
  rise: `${between(-70, -20)}px`,
}));

/** Burbujas que nacen detrás del destello conforme recorre el aro. */
const BUBBLES = Array.from({ length: 16 }, (_, i) => {
  const turn = 0.08 + (i / 16) * 0.85;
  return {
    angle: `${turn * 360}deg`,
    delay: `${0.1 + turn * 0.65}s`,
    size: `${between(6, 18)}px`,
    drift: `${between(14, 44)}px`,
  };
});

/** Chorro de vapor de plancha: entra por la izquierda a la altura del logo y lo cruza. */
const JET = Array.from({ length: 16 }, (_, i) => ({
  y: `${50 + between(-9, 9)}%`,
  width: `${between(20, 34)}vw`,
  to: `${between(60, 105)}vw`,
  wave: `${between(-6, 6)}vh`,
  delay: `${0.7 + i * 0.035}s`,
}));

/** Hilos rizados que el chorro deja atrás, del lado izquierdo. */
const WISPS = Array.from({ length: 10 }, () => ({
  x: `${between(2, 38)}%`,
  y: `${50 + between(-14, 14)}%`,
  width: `${between(5, 12)}vw`,
  tilt: `${between(-35, 35)}deg`,
  delay: `${between(0.95, 1.25)}s`,
}));

/** El vapor choca a la derecha, se acumula y regresa hacia la izquierda cubriendo todo. */
const BILLOW = Array.from({ length: 10 }, (_, i) => ({
  x: `${between(82, 106)}%`,
  y: `${between(12, 88)}%`,
  width: `${between(28, 46)}vw`,
  to: `${between(-80, -40)}vw`,
  delay: `${1.1 + i * 0.035 + rand() * 0.08}s`,
}));

/** Chispas doradas cuando el vapor se disipa. */
const EMBERS = Array.from({ length: 28 }, () => ({
  x: `${between(5, 95)}%`,
  y: `${between(10, 95)}%`,
  size: `${between(2, 4.5)}px`,
  dx: `${between(-30, 30)}px`,
  rise: `${between(-80, -30)}px`,
  delay: `${between(1.8, 2.25)}s`,
}));

export function LoginIntro() {
  const [phase, setPhase] = useState<"playing" | "fading" | "done">(() => (isLoginIntroQueued() ? "playing" : "done"));
  const isPlaying = phase === "playing";

  useEffect(clearLoginIntro, []);

  useEffect(() => {
    if (phase === "done") return;
    const t = setTimeout(() => setPhase(isPlaying ? "fading" : "done"), isPlaying ? INTRO_MS : FADE_MS);
    return () => clearTimeout(t);
  }, [phase, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const audio = new Audio("/intro-steam.mp3");
    audio.volume = 0.8;
    const t = setTimeout(() => {
      // El clic de "Entrar" cuenta como interacción, pero si el navegador bloquea el audio la intro sigue en silencio.
      audio.play().catch(() => undefined);
    }, STEAM_SOUND_AT_MS);
    return () => {
      clearTimeout(t);
      audio.pause();
    };
  }, [isPlaying]);

  if (phase === "done") return null;

  return (
    <div
      role="presentation"
      aria-label="Tintorería Francia"
      onClick={() => setPhase("fading")}
      className={cn("tf-intro fixed inset-0 z-[100] cursor-pointer overflow-hidden", phase === "fading" && "opacity-0")}
    >
      {DUST.map((d, i) => (
        <span
          key={i}
          className="tf-intro-dust"
          style={vars({ left: d.x, top: d.y, width: d.size, height: d.size, "--rise": d.rise, animationDelay: d.delay })}
        />
      ))}

      <div className="tf-intro-stage">
        <div className="tf-intro-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- recurso estático, sin optimización */}
          <img src="/logo-francia.png" alt="" draggable={false} />
          <span className="tf-intro-glint" />
        </div>

        <div className="tf-intro-orbit">
          <span className="tf-intro-trail" />
          <span className="tf-intro-spark" />
        </div>

        {BUBBLES.map((b, i) => (
          <span key={i} className="tf-intro-bubble-arm" style={vars({ "--angle": b.angle })}>
            <span
              className="tf-intro-bubble"
              style={vars({ width: b.size, height: b.size, "--drift": b.drift, animationDelay: b.delay })}
            />
          </span>
        ))}

        <span className="tf-intro-star" style={{ left: "12.5%" }} />
        <span className="tf-intro-star" style={{ left: "87.5%", animationDelay: "2.15s" }} />
      </div>

      <div className="tf-intro-steam">
        {JET.map((j, i) => (
          <span
            key={i}
            className="tf-intro-jet"
            style={vars({ top: j.y, width: j.width, "--to": j.to, "--wave": j.wave, animationDelay: j.delay })}
          />
        ))}
        {WISPS.map((w, i) => (
          <span
            key={i}
            className="tf-intro-wisp"
            style={vars({ left: w.x, top: w.y, width: w.width, "--tilt": w.tilt, animationDelay: w.delay })}
          />
        ))}
        {BILLOW.map((b, i) => (
          <span
            key={i}
            className="tf-intro-billow"
            style={vars({ left: b.x, top: b.y, width: b.width, "--to": b.to, animationDelay: b.delay })}
          />
        ))}
      </div>
      <span className="tf-intro-veil" />

      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="tf-intro-ember"
          style={vars({
            left: e.x,
            top: e.y,
            width: e.size,
            height: e.size,
            "--dx": e.dx,
            "--rise": e.rise,
            animationDelay: e.delay,
          })}
        />
      ))}
    </div>
  );
}
