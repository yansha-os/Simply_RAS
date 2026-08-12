/**
 * Canvas renderers for the Theme & Animation Engine.
 * Each renderer = { init, frame }. Registered by CanvasKind in `RENDERERS`.
 * Contract: frame() must be cheap (no allocation storms), counts capped,
 * and everything scaled by env.intensity / env.speed. Trails are achieved by
 * painting a translucent base-color rect instead of clearing.
 */

import type { CanvasKind } from './themeRegistry';

export interface RendererEnv {
  width: number;
  height: number;
  /** 0.6 subtle / 1 normal / 1.45 vivid */
  intensity: number;
  /** 0.5 .. 2 speed multiplier */
  speed: number;
  accent: [number, number, number];
  base: [number, number, number];
  preview: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CanvasRenderer {
  init(env: RendererEnv): any;
  frame(ctx: CanvasRenderingContext2D, state: any, env: RendererEnv, dt: number, t: number): void;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function clampCount(n: number, min: number, max: number, env: RendererEnv): number {
  const scaled = n * env.intensity * (env.preview ? 0.35 : 1);
  return Math.round(Math.min(max, Math.max(env.preview ? 4 : min, scaled)));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Paint a translucent base-color rect for motion trails. */
function fade(ctx: CanvasRenderingContext2D, env: RendererEnv, perFrameAlpha: number, dt: number) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(env.base, Math.min(0.5, perFrameAlpha * dt * 60));
  ctx.fillRect(0, 0, env.width, env.height);
}

/* ------------------------------------------------------------------ */
/* Starfield Parallax                                                   */
/* ------------------------------------------------------------------ */

const starfield: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 9000, 40, 260, env);
    return {
      stars: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        z: rand(0.25, 1), // depth: far → slow & dim
        r: rand(0.4, 1.6),
        phase: rand(0, Math.PI * 2),
        tw: rand(0.4, 1.6),
        warm: Math.random() < 0.3,
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [ar, ag, ab] = env.accent;
    for (const s of state.stars) {
      s.x -= s.z * 9 * env.speed * dt;
      if (s.x < -2) {
        s.x = env.width + 2;
        s.y = Math.random() * env.height;
      }
      const twinkle = 0.3 + 0.7 * Math.sin(t * s.tw * env.speed + s.phase) ** 2;
      const alpha = twinkle * (0.25 + 0.75 * s.z) * Math.min(1, env.intensity);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
      ctx.fillStyle = s.warm ? `rgba(${ar},${ag},${ab},${alpha})` : `rgba(235,240,255,${alpha})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* Particle Nexus (particles + connection lines)                        */
/* ------------------------------------------------------------------ */

const particleNexus: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 22000, 18, 80, env);
    return {
      nodes: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-14, 14),
        vy: rand(-14, 14),
        r: rand(1, 2.2),
      })),
      linkDist: env.preview ? 60 : 130,
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const { nodes, linkDist } = state;
    for (const n of nodes) {
      n.x += n.vx * env.speed * dt;
      n.y += n.vy * env.speed * dt;
      if (n.x < 0 || n.x > env.width) n.vx *= -1;
      if (n.y < 0 || n.y > env.height) n.vy *= -1;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const a = (1 - Math.sqrt(d2) / linkDist) * 0.32 * env.intensity;
          ctx.strokeStyle = rgba(env.accent, a);
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(env.accent, 0.75 * Math.min(1, env.intensity));
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* Code Rain (matrix-style, brand-tinted)                               */
/* ------------------------------------------------------------------ */

const GLYPHS = 'アイウエオカキクケコサシスセソタチツ0123456789<>[]{}=+*#$';

const codeRain: CanvasRenderer = {
  init(env) {
    const cellW = env.preview ? 12 : 18;
    const step = env.intensity < 0.8 ? 2 : 1; // subtle → every other column
    const cols: { y: number; v: number }[] = [];
    for (let x = 0; x * cellW < env.width; x += step) {
      cols.push({ y: rand(-40, 0), v: rand(3.5, 9) });
    }
    return { cols, cellW, step, seeded: false };
  },
  frame(ctx, state, env, dt) {
    if (!state.seeded) {
      ctx.fillStyle = rgba(env.base, 1);
      ctx.fillRect(0, 0, env.width, env.height);
      state.seeded = true;
    }
    fade(ctx, env, 0.09, dt);
    const fontSize = env.preview ? 10 : 15;
    ctx.font = `${fontSize}px monospace`;
    const rows = env.height / fontSize;
    state.cols.forEach((c: { y: number; v: number }, i: number) => {
      c.y += c.v * env.speed * dt;
      if (c.y > rows + rand(0, 30)) {
        c.y = rand(-20, 0);
        c.v = rand(3.5, 9);
      }
      const x = i * state.cellW * state.step;
      const y = c.y * fontSize;
      if (y < -fontSize || y > env.height + fontSize) return;
      const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      // Bright head + accent body (trail handled by fade overlay)
      ctx.fillStyle = rgba(env.accent, 0.85 * Math.min(1, env.intensity));
      ctx.fillText(ch, x, y);
      ctx.fillStyle = `rgba(230,255,244,${0.9 * Math.min(1, env.intensity)})`;
      ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], x, y + fontSize);
    });
  },
};

/* ------------------------------------------------------------------ */
/* Firefly Swarm (organic sum-of-sines drift)                           */
/* ------------------------------------------------------------------ */

const fireflySwarm: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 42000, 8, 42, env);
    return {
      flies: Array.from({ length: count }, () => ({
        ax: Math.random() * env.width,
        ay: Math.random() * env.height,
        avx: rand(-6, 6),
        avy: rand(-4, 4),
        f1: rand(0.15, 0.5),
        f2: rand(0.05, 0.25),
        p1: rand(0, Math.PI * 2),
        p2: rand(0, Math.PI * 2),
        amp1: rand(20, 70),
        amp2: rand(10, 40),
        pulseF: rand(0.4, 1.2),
        pulseP: rand(0, Math.PI * 2),
        r: rand(1.2, 2.6),
        green: Math.random() < 0.35,
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    ctx.globalCompositeOperation = 'lighter';
    const ts = t * env.speed;
    for (const f of state.flies) {
      f.ax += f.avx * env.speed * dt;
      f.ay += f.avy * env.speed * dt;
      if (f.ax < -80) f.ax = env.width + 80;
      if (f.ax > env.width + 80) f.ax = -80;
      if (f.ay < -80) f.ay = env.height + 80;
      if (f.ay > env.height + 80) f.ay = -80;
      const x = f.ax + Math.sin(ts * f.f1 + f.p1) * f.amp1 + Math.sin(ts * f.f2 + f.p2) * f.amp2;
      const y = f.ay + Math.cos(ts * f.f1 * 0.8 + f.p2) * f.amp1 * 0.6 + Math.cos(ts * f.f2 + f.p1) * f.amp2;
      const pulse = (Math.sin(ts * f.pulseF + f.pulseP) + 1) / 2;
      const a = (0.15 + 0.85 * pulse) * 0.9 * Math.min(1, env.intensity);
      const glowR = f.r * (5 + 4 * pulse);
      const core: [number, number, number] = f.green ? [190, 242, 100] : env.accent;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, rgba(core, a));
      g.addColorStop(0.4, rgba(core, a * 0.35));
      g.addColorStop(1, rgba(core, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};

/* ------------------------------------------------------------------ */
/* Meteor Shower (diagonal streaks over still stars)                    */
/* ------------------------------------------------------------------ */

const meteorShower: CanvasRenderer = {
  init(env) {
    return {
      stars: Array.from({ length: env.preview ? 20 : 70 }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        r: rand(0.3, 1.1),
        a: rand(0.15, 0.7),
        tw: rand(0.3, 1),
        phase: rand(0, Math.PI * 2),
      })),
      meteors: [] as any[],
      spawnIn: 0.5,
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    for (const s of state.stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(t * s.tw + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,240,255,${a * Math.min(1, env.intensity)})`;
      ctx.fill();
    }
    state.spawnIn -= dt * env.speed;
    const maxActive = env.preview ? 2 : Math.round(3 + 3 * env.intensity);
    if (state.spawnIn <= 0 && state.meteors.length < maxActive) {
      state.spawnIn = rand(0.6, 2.4) / env.intensity;
      const speed = rand(380, 680);
      state.meteors.push({
        x: rand(env.width * 0.2, env.width * 1.15),
        y: rand(-env.height * 0.15, env.height * 0.25),
        vx: -speed * 0.72,
        vy: speed * 0.7,
        len: rand(70, 170),
        life: 0,
        maxLife: rand(1.1, 2),
      });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = state.meteors.length - 1; i >= 0; i--) {
      const m = state.meteors[i];
      m.life += dt * env.speed;
      m.x += m.vx * env.speed * dt;
      m.y += m.vy * env.speed * dt;
      if (m.life > m.maxLife || m.y > env.height + m.len) {
        state.meteors.splice(i, 1);
        continue;
      }
      const fadeA = Math.sin(Math.min(1, m.life / m.maxLife) * Math.PI); // in & out
      const norm = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / norm) * m.len;
      const ty = m.y - (m.vy / norm) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * fadeA * Math.min(1, env.intensity)})`);
      g.addColorStop(0.25, rgba(env.accent, 0.6 * fadeA * Math.min(1, env.intensity)));
      g.addColorStop(1, rgba(env.accent, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${fadeA})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};

/* ------------------------------------------------------------------ */
/* Circuit Flow (traces + traveling pulses)                             */
/* ------------------------------------------------------------------ */

function buildTrace(env: RendererEnv) {
  const grid = 24;
  const snap = (v: number) => Math.round(v / grid) * grid;
  let x = snap(rand(0, env.width));
  let y = snap(rand(0, env.height));
  const pts = [{ x, y }];
  let horizontal = Math.random() < 0.5;
  const segs = Math.floor(rand(4, 8));
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const len = snap(rand(60, 220)) * (Math.random() < 0.5 ? -1 : 1);
    if (horizontal) x += len;
    else y += len;
    pts.push({ x, y });
    total += Math.abs(len);
    horizontal = !horizontal;
  }
  return { pts, total, offset: rand(0, 1200), pulseSpeed: rand(90, 220) };
}

const circuitFlow: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 55000, 8, 34, env);
    return { traces: Array.from({ length: count }, () => buildTrace(env)) };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const dim = 0.12 * Math.min(1, env.intensity);
    ctx.lineWidth = 1;
    for (const tr of state.traces) {
      // dim base trace + solder nodes
      ctx.strokeStyle = rgba(env.accent, dim);
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      ctx.stroke();
      for (const p of [tr.pts[0], tr.pts[tr.pts.length - 1]]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(env.accent, dim * 2.2);
        ctx.fill();
      }
      // traveling pulse with a short bright tail
      const cycle = tr.total + 400;
      const head = (t * tr.pulseSpeed * env.speed + tr.offset) % cycle;
      if (head > tr.total) continue;
      const tail = Math.max(0, head - 50);
      let acc = 0;
      ctx.strokeStyle = rgba(env.accent, 0.85 * Math.min(1, env.intensity));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      let headPt: { x: number; y: number } | null = null;
      for (let i = 1; i < tr.pts.length; i++) {
        const a = tr.pts[i - 1];
        const b = tr.pts[i];
        const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        const segStart = acc;
        const segEnd = acc + segLen;
        const lerp = (d: number) => ({
          x: a.x + ((b.x - a.x) * (d - segStart)) / (segLen || 1),
          y: a.y + ((b.y - a.y) * (d - segStart)) / (segLen || 1),
        });
        if (segEnd > tail && segStart < head) {
          const from = lerp(Math.max(tail, segStart));
          const to = lerp(Math.min(head, segEnd));
          if (!started) {
            ctx.moveTo(from.x, from.y);
            started = true;
          }
          ctx.lineTo(to.x, to.y);
          if (head <= segEnd) headPt = to;
        }
        acc = segEnd;
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      if (headPt) {
        const g = ctx.createRadialGradient(headPt.x, headPt.y, 0, headPt.x, headPt.y, 9);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * Math.min(1, env.intensity)})`);
        g.addColorStop(0.3, rgba(env.accent, 0.7 * Math.min(1, env.intensity)));
        g.addColorStop(1, rgba(env.accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(headPt.x, headPt.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* Rain on Glass (streaking drops + condensation beads)                 */
/* ------------------------------------------------------------------ */

const rainGlass: CanvasRenderer = {
  init(env) {
    const drops = clampCount(env.width / 26, 8, 54, env);
    const beads = clampCount(env.width / 14, 12, 90, env);
    return {
      seeded: false,
      drops: Array.from({ length: drops }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        v: rand(60, 260),
        r: rand(1, 2.4),
        wob: rand(1, 4),
        wf: rand(1.5, 5),
        wp: rand(0, Math.PI * 2),
      })),
      beads: Array.from({ length: beads }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        r: rand(0.5, 1.8),
        a: rand(0.05, 0.3),
        tw: rand(0.1, 0.5),
        phase: rand(0, Math.PI * 2),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    if (!state.seeded) {
      ctx.fillStyle = rgba(env.base, 1);
      ctx.fillRect(0, 0, env.width, env.height);
      state.seeded = true;
    }
    fade(ctx, env, 0.05, dt); // slow fade → glossy streak trails
    const tint: [number, number, number] = [
      Math.round((env.accent[0] + 150) / 2),
      Math.round((env.accent[1] + 190) / 2),
      Math.round((env.accent[2] + 230) / 2),
    ];
    for (const b of state.beads) {
      const a = b.a * (0.5 + 0.5 * Math.sin(t * b.tw + b.phase)) * Math.min(1, env.intensity);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tint, a);
      ctx.fill();
    }
    for (const d of state.drops) {
      d.y += d.v * env.speed * dt;
      d.x += Math.sin(t * d.wf + d.wp) * d.wob * env.speed * dt * 6;
      if (d.y > env.height + 6) {
        d.y = -6;
        d.x = Math.random() * env.width;
        d.v = rand(60, 260);
      }
      const a = 0.5 * Math.min(1, env.intensity);
      const g = ctx.createLinearGradient(d.x, d.y - d.r * 5, d.x, d.y + d.r);
      g.addColorStop(0, rgba(tint, 0));
      g.addColorStop(1, rgba(tint, a));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // highlight glint
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.6, d.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
      ctx.fill();
    }
  },
};

export const RENDERERS: Record<CanvasKind, CanvasRenderer> = {
  starfield,
  'particle-nexus': particleNexus,
  'code-rain': codeRain,
  'firefly-swarm': fireflySwarm,
  'meteor-shower': meteorShower,
  'circuit-flow': circuitFlow,
  'rain-glass': rainGlass,
};
