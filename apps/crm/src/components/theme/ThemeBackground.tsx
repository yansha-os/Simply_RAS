'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import './theme-engine.css';
import {
  ACCENT_RGB,
  INTENSITY_FACTOR,
  getTheme,
  type AccentColor,
  type EngineIntensity,
  type ThemeDefinition,
} from './themeRegistry';
import { RENDERERS, type RendererEnv, type PointerState } from './canvasRenderers';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

const getReducedMotionSnapshot = () =>
  window.matchMedia(REDUCED_MOTION_QUERY).matches;
const getServerReducedMotionSnapshot = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot
  );
}

/* ------------------------------------------------------------------ */
/* Canvas host: rAF loop + DPR cap + visibility pause + interactive pointer */
/* ------------------------------------------------------------------ */

function ThemeCanvas({
  theme,
  intensity,
  speed,
  accent,
  colorMode = 'dark',
  preview,
  cursorFxEnabled = false,
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  colorMode?: 'light' | 'dark';
  preview?: boolean;
  cursorFxEnabled?: boolean;
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
    let dpr = 1;

    const pointer: PointerState = {
      x: -1000,
      y: -1000,
      isHovering: false,
      isDown: false,
      ripples: [],
    };

    const setup = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth || 1;
      const h = parent.clientHeight || 1;
      dpr = Math.min(window.devicePixelRatio || 1, preview ? 1 : 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const isLight = colorMode === 'light';
      const baseHex = isLight ? (theme.lightBaseColor || '#FFFDF8') : theme.baseColor;
      env = {
        width: w,
        height: h,
        intensity: INTENSITY_FACTOR[intensity],
        speed,
        accent: ACCENT_RGB[accent],
        base: hexToRgb(baseHex),
        isLightMode: isLight,
        preview: !!preview,
        pointer,
      };
      state = renderer.init(env);
    };

    const tick = (now: number) => {
      if (!running || !env) return;
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      elapsed += dt;

      // Smooth pointer coordinates via exponential moving average (EMA)
      if (pointer.isHovering) {
        pointer.x += (pointer.x - pointer.x) * (1 - Math.exp(-30 * dt));
      }

      // Always enforce pixel-perfect DPR transform before rendering frame
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Update click shockwave ripples (only when cursor FX enabled)
      if (cursorFxEnabled && pointer.ripples.length > 0) {
        for (let i = pointer.ripples.length - 1; i >= 0; i--) {
          const r = pointer.ripples[i];
          r.radius += 220 * speed * dt;
          r.opacity = Math.max(0, 1 - r.radius / r.maxRadius);
          if (r.radius >= r.maxRadius || r.opacity <= 0) {
            pointer.ripples.splice(i, 1);
          }
        }
      }

      renderer.frame(ctx, state, env, dt, elapsed);

      // Render click ripples if present
      if (cursorFxEnabled && pointer.ripples.length > 0) {
        const [ar, ag, ab] = env.accent;
        for (const rip of pointer.ripples) {
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${rip.opacity * 0.45 * env.intensity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

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

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        setup();
      });
    };

    // Interactive pointer handlers (only active on full canvas)
    const onPointerMove = (e: MouseEvent) => {
      if (preview) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.isHovering = true;
    };

    const onPointerLeave = () => {
      if (preview) return;
      pointer.isHovering = false;
      pointer.x = -1000;
      pointer.y = -1000;
    };

    const onPointerDown = (e: MouseEvent) => {
      if (preview || !cursorFxEnabled) return;
      pointer.isDown = true;
      pointer.ripples.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: 180,
        opacity: 1,
      });
    };

    const onPointerUp = () => {
      if (preview) return;
      pointer.isDown = false;
    };

    setup();
    start();

    document.addEventListener('visibilitychange', onVisibility);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      ro = new ResizeObserver(() => onResize());
      ro.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', onResize);
    }

    if (!preview && cursorFxEnabled) {
      window.addEventListener('mousedown', onPointerDown, { passive: true });
      window.addEventListener('mouseup', onPointerUp, { passive: true });
    }

    if (!preview) {
      window.addEventListener('mousemove', onPointerMove, { passive: true });
      window.addEventListener('mouseleave', onPointerLeave, { passive: true });
    }

    return () => {
      stop();
      cancelAnimationFrame(resizeRaf);
      document.removeEventListener('visibilitychange', onVisibility);
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener('resize', onResize);
      }
      if (!preview) {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseleave', onPointerLeave);
      }
      if (!preview && cursorFxEnabled) {
        window.removeEventListener('mousedown', onPointerDown);
        window.removeEventListener('mouseup', onPointerUp);
      }
    };
  }, [theme, intensity, speed, accent, colorMode, preview, cursorFxEnabled]);

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
  colorMode = 'dark',
  reducedMotion,
  preview,
  cursorFxEnabled = false,
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  colorMode?: 'light' | 'dark';
  reducedMotion: boolean;
  preview?: boolean;
  cursorFxEnabled?: boolean;
}) {
  const isLight = colorMode === 'light';
  const effectiveBase = isLight ? (theme.lightBaseColor || '#FFFDF8') : theme.baseColor;
  const effectiveStatic = isLight ? (theme.lightStaticBackground || theme.staticBackground) : theme.staticBackground;

  if (reducedMotion || theme.engine === 'none') {
    return (
      <div
        className="theme-engine-base"
        style={{
          position: 'absolute',
          inset: 0,
          background: effectiveStatic,
        }}
      />
    );
  }

  if (theme.engine === 'canvas') {
    return (
      <div
        className="theme-engine-base"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: effectiveBase,
        }}
      >
        <ThemeCanvas
          theme={theme}
          intensity={intensity}
          speed={speed}
          accent={accent}
          colorMode={colorMode}
          preview={preview}
          cursorFxEnabled={cursorFxEnabled}
        />
      </div>
    );
  }

  if (theme.engine === 'css') {
    const layers = Array.from({ length: theme.cssLayers ?? 0 }, (_, i) => i + 1);
    return (
      <div
        className="theme-engine-base"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: effectiveBase,
        }}
      >
        {layers.map((l) => (
          <div
            key={l}
            className={`theme-layer theme-${theme.id}-l${l}`}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  // Legacy (cosmic-stars, liquid-aurora, cyberpunk-grid)
  return (
    <div
      className="theme-engine-base"
      style={{
        position: 'absolute',
        inset: 0,
        background: effectiveStatic,
      }}
    />
  );
}

export default function ThemeBackground({
  mode,
  intensity,
  speed,
  accent,
  colorMode = 'dark',
  cursorFxEnabled = false,
}: {
  mode: string;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  colorMode?: 'light' | 'dark';
  cursorFxEnabled?: boolean;
}) {
  const theme = getTheme(mode);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      id="theme-engine-host"
      aria-hidden="true"
      style={
        {
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
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
        colorMode={colorMode}
        reducedMotion={reducedMotion}
        cursorFxEnabled={cursorFxEnabled}
      />
    </div>
  );
}
