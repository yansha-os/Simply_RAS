'use client';

import React, { useEffect, useRef, useState } from 'react';
import './theme-engine.css';
import {
  ACCENT_RGB,
  INTENSITY_FACTOR,
  getTheme,
  type AccentColor,
  type EngineIntensity,
  type ThemeDefinition,
} from './themeRegistry';
import { RENDERERS, type RendererEnv } from './canvasRenderers';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Canvas host: rAF loop + DPR cap + visibility pause + cleanup        */
/* ------------------------------------------------------------------ */

function ThemeCanvas({
  theme,
  intensity,
  speed,
  accent,
  preview,
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  preview?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !theme.canvas) return;
    const renderer = RENDERERS[theme.canvas];
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let last = 0;
    let elapsed = 0;
    let state: unknown;
    let env: RendererEnv | null = null;

    const setup = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth || 1;
      const h = parent.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, preview ? 1 : 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      env = {
        width: w,
        height: h,
        intensity: INTENSITY_FACTOR[intensity],
        speed,
        accent: ACCENT_RGB[accent],
        base: hexToRgb(theme.baseColor),
        preview: !!preview,
      };
      state = renderer.init(env);
    };

    const tick = (now: number) => {
      if (!running || !env) return;
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      elapsed += dt;
      renderer.frame(ctx, state, env, dt, elapsed);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    const onResize = () => {
      setup();
    };

    setup();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, [theme, intensity, speed, accent, preview]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Theme layers: base color + CSS layer divs or single canvas          */
/* Reused by the full-screen background AND the modal mini previews.   */
/* ------------------------------------------------------------------ */

export function ThemeLayers({
  theme,
  intensity,
  speed,
  accent,
  reducedMotion,
  preview,
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  reducedMotion: boolean;
  preview?: boolean;
}) {
  if (reducedMotion || theme.engine === 'legacy' || theme.engine === 'none') {
    return <div className="theme-bg-static" style={{ background: theme.staticBackground }} />;
  }
  if (theme.engine === 'canvas') {
    return (
      <ThemeCanvas theme={theme} intensity={intensity} speed={speed} accent={accent} preview={preview} />
    );
  }
  return (
    <>
      {Array.from({ length: theme.cssLayers ?? 0 }, (_, i) => (
        <div key={i} className={`theme-layer theme-${theme.id}-l${i + 1}`} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Full-screen background (mounted once inside ThemeProvider)          */
/* ------------------------------------------------------------------ */

export default function ThemeBackground({
  mode,
  intensity,
  speed,
  accent,
}: {
  mode: string;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
}) {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pause engine CSS animations while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) document.documentElement.setAttribute('data-anim-paused', '');
      else document.documentElement.removeAttribute('data-anim-paused');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.documentElement.removeAttribute('data-anim-paused');
    };
  }, []);

  if (!mounted) return null;

  const theme = getTheme(mode);
  // Legacy + matte themes are rendered by the pre-engine globals.css rules.
  if (theme.engine === 'legacy' || theme.engine === 'none') return null;

  return (
    <div
      className="theme-bg-root"
      aria-hidden="true"
      style={
        {
          background: theme.baseColor,
          '--ti': INTENSITY_FACTOR[intensity],
          '--ts': speed,
        } as React.CSSProperties
      }
    >
      <ThemeLayers
        theme={theme}
        intensity={intensity}
        speed={speed}
        accent={accent}
        reducedMotion={reducedMotion}
      />
      <div className="theme-bg-scrim" />
    </div>
  );
}
