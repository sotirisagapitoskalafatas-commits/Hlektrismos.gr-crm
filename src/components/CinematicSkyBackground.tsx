"use client";

/**
 * CinematicSkyBackground
 * Scroll-driven night flight: cabin window -> push through the glass ->
 * volumetric cloud pass -> Athens / Parthenon above the clouds.
 *
 * Drop in: web/src/components/CinematicSkyBackground.tsx
 * Images:  web/public/sky/cabin-window.jpg, web/public/sky/athens-clouds.jpg
 *
 * Renders only fixed background layers (z-index 0). Put page content in a
 * `relative z-10` wrapper above it. No dependencies — one rAF loop, transform
 * and opacity only, so it stays on the compositor.
 */

import { useEffect, useRef } from "react";

type Props = {
  /** How many viewport heights the cabin -> clouds -> Athens push takes. */
  pushScreens?: number;
  /** 0–1 strength of the cloud veil at the pass-through moment. */
  mistIntensity?: number;
  cabinSrc?: string;
  skySrc?: string;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const ease = (t: number) => t * t * (3 - 2 * t);

export default function CinematicSkyBackground({
  pushScreens = 1.75,
  mistIntensity = 0.65,
  cabinSrc = "/sky/cabin-window.jpg",
  skySrc = "/sky/athens-clouds.jpg",
}: Props) {
  const cabin = useRef<HTMLDivElement | null>(null);
  const sky = useRef<HTMLDivElement | null>(null);
  const mist = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      if (cabin.current) cabin.current.style.opacity = "0";
      if (sky.current) {
        sky.current.style.opacity = "1";
        sky.current.style.transform = "scale(1.04)";
      }
      return;
    }

    let frame = 0;
    let cur = 0;

    const loop = () => {
      const vh = window.innerHeight || 800;
      const span = vh * pushScreens;
      const y = window.scrollY || window.pageYOffset || 0;
      const target = clamp(y / span, 0, 1);

      cur += (target - cur) * 0.11;
      if (Math.abs(target - cur) < 0.0004) cur = target;
      const p = cur;
      const beyond = clamp((y - span) / (vh * 3), 0, 1);

      if (cabin.current) {
        const s = Math.pow(1 + p, 2.7); // accelerating push toward the glass
        cabin.current.style.transform = `scale(${s.toFixed(4)})`;
        cabin.current.style.opacity = (1 - seg(p, 0.5, 0.82)).toFixed(3);
        cabin.current.style.filter = `blur(${(seg(p, 0.42, 0.86) * 18).toFixed(
          2
        )}px) brightness(${(1 + seg(p, 0.25, 0.85) * 0.45).toFixed(3)})`;
      }

      if (mist.current) {
        const bell = Math.sin(Math.PI * seg(p, 0.26, 0.98));
        mist.current.style.opacity = (bell * mistIntensity).toFixed(3);
        mist.current.style.transform = `scale(${(
          1 + seg(p, 0.2, 1) * 1.9
        ).toFixed(3)}) translateY(${(-seg(p, 0.2, 1) * 8).toFixed(2)}%)`;
      }

      if (sky.current) {
        sky.current.style.opacity = ease(seg(p, 0.52, 0.96)).toFixed(3);
        const s = 1.32 - 0.28 * ease(seg(p, 0.5, 1)) + beyond * 0.07;
        sky.current.style.transform = `scale(${s.toFixed(4)}) translateY(${(
          -beyond * 3.2
        ).toFixed(2)}%)`;
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [pushScreens, mistIntensity]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        background: "#030711",
        pointerEvents: "none",
      }}
    >
      <div
        ref={cabin}
        style={{
          position: "absolute",
          inset: "-4%",
          backgroundImage: `url('${cabinSrc}')`,
          backgroundSize: "cover",
          backgroundPosition: "52% 50%",
          transformOrigin: "47% 50%",
          willChange: "transform, opacity, filter",
        }}
      />
      <div
        ref={sky}
        style={{
          position: "absolute",
          inset: "-6%",
          opacity: 0,
          backgroundImage: `url('${skySrc}')`,
          backgroundSize: "cover",
          backgroundPosition: "50% 46%",
          transformOrigin: "50% 46%",
          willChange: "transform, opacity",
        }}
      />
      <div
        ref={mist}
        style={{
          position: "absolute",
          inset: "-25%",
          opacity: 0,
          filter: "blur(28px)",
          background:
            "radial-gradient(38% 44% at 22% 68%, rgba(214,228,248,.85), rgba(214,228,248,0) 70%), radial-gradient(44% 40% at 74% 74%, rgba(196,214,240,.7), rgba(196,214,240,0) 72%), radial-gradient(50% 46% at 48% 92%, rgba(226,236,252,.8), rgba(226,236,252,0) 70%)",
          willChange: "transform, opacity",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 90% at 50% 40%, rgba(3,7,17,0) 32%, rgba(3,7,17,.62) 100%)",
        }}
      />
    </div>
  );
}
