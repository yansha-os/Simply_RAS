/**
 * Canvas renderers for the Hyper-Custom Theme & Animation Engine 2.0.
 * 20+ High-Fidelity Physics & Procedural Canvas Engines.
 */

import type { CanvasKind } from './themeRegistry';

export interface PointerRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

export interface PointerState {
  x: number;
  y: number;
  isHovering: boolean;
  isDown: boolean;
  ripples: PointerRipple[];
}

export interface RendererEnv {
  width: number;
  height: number;
  /** 0.5 subtle / 1.0 normal / 1.5 vivid / 2.2 ultra */
  intensity: number;
  /** 0.25 .. 3.0 speed multiplier */
  speed: number;
  accent: [number, number, number];
  base: [number, number, number];
  isLightMode?: boolean;
  preview: boolean;
  pointer?: PointerState;
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

/** Paint a translucent base-color rect for motion trails with edge overflow coverage. */
function fade(ctx: CanvasRenderingContext2D, env: RendererEnv, perFrameAlpha: number, dt: number) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(env.base, Math.min(0.6, perFrameAlpha * dt * 60));
  ctx.fillRect(-20, -20, env.width + 40, env.height + 40);
}

/* ------------------------------------------------------------------ */
/* 1. Starfield Parallax with Celestial Nebula Haze                   */
/* ------------------------------------------------------------------ */
const starfield: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 7500, 60, 320, env);
    return {
      stars: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        z: rand(0.15, 1),
        r: rand(0.5, 2.0),
        phase: rand(0, Math.PI * 2),
        tw: rand(0.5, 2.2),
        warm: Math.random() < 0.35,
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [ar, ag, ab] = env.accent;
    const ptr = env.pointer;

    // 1. Subtle celestial nebula haze in background
    if (!env.isLightMode && !env.preview) {
      const cx = env.width * 0.5;
      const cy = env.height * 0.45;
      const nebGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(env.width, env.height) * 0.65);
      nebGrad.addColorStop(0, `rgba(${ar},${ag},${ab},${0.06 * env.intensity})`);
      nebGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${0.02 * env.intensity})`);
      nebGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = nebGrad;
      ctx.fillRect(0, 0, env.width, env.height);
    }

    // 2. Render stars
    for (const s of state.stars) {
      s.x -= s.z * 12 * env.speed * dt;
      if (s.x < -10) {
        s.x = env.width + 10;
        s.y = Math.random() * env.height;
      }

      if (ptr && ptr.isHovering) {
        const dx = ptr.x - s.x;
        const dy = ptr.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140 && dist > 1) {
          const force = (1 - dist / 140) * 18 * s.z * dt;
          s.x += (dx / dist) * force;
          s.y += (dy / dist) * force;
        }
      }

      const twinkle = 0.35 + 0.65 * Math.sin(t * s.tw * env.speed + s.phase) ** 2;
      const alpha = twinkle * (0.25 + 0.75 * s.z) * Math.min(1, env.intensity);

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
      if (env.isLightMode) {
        ctx.fillStyle = s.warm ? `rgba(${ar},${ag},${ab},${alpha * 0.95})` : `rgba(71,85,105,${alpha * 0.8})`;
      } else {
        ctx.fillStyle = s.warm ? `rgba(${ar},${ag},${ab},${alpha})` : `rgba(240,245,255,${alpha})`;
      }
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 2. Particle Nexus (Neural Web with Batched Links & Synapse Pulses) */
/* ------------------------------------------------------------------ */
const particleNexus: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 16000, 26, 95, env);
    return {
      nodes: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-16, 16),
        vy: rand(-16, 16),
        r: rand(1.4, 2.8),
      })),
      linkDist: env.preview ? 75 : 145,
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const { nodes, linkDist } = state;
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    // Node physics & cursor spring
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx * env.speed * dt;
      n.y += n.vy * env.speed * dt;

      if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx); }
      if (n.x > env.width) { n.x = env.width; n.vx = -Math.abs(n.vx); }
      if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy); }
      if (n.y > env.height) { n.y = env.height; n.vy = -Math.abs(n.vy); }

      if (ptr && ptr.isHovering) {
        const dx = n.x - ptr.x;
        const dy = n.y - ptr.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 150 && dist > 1) {
          const force = (1 - dist / 150) * 110 * dt;
          n.x += (dx / dist) * force;
          n.y += (dy / dist) * force;
        }
      }
    }

    // High-performance BATCHED link rendering (1 draw call)
    ctx.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dx = n.x - m.x;
        const dy = n.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
        }
      }
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.32 : 0.22) * env.intensity})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // High-performance BATCHED node rendering (1 draw call)
    ctx.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      ctx.moveTo(n.x + n.r, n.y);
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.85 : 0.7) * env.intensity})`;
    ctx.fill();
  },
};

/* ------------------------------------------------------------------ */
/* 3. Code Rain (Matrix Phosphor Stream)                              */
/* ------------------------------------------------------------------ */
const codeRain: CanvasRenderer = {
  init(env) {
    const colW = env.preview ? 16 : 20;
    const cols = Math.floor(env.width / colW);
    return {
      colW,
      drops: Array.from({ length: cols }, () => ({
        y: rand(-env.height, 0),
        speed: rand(90, 220),
        chars: Array.from({ length: Math.floor(rand(8, 20)) }, () =>
          String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96))
        ),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.15, dt);
    const { colW, drops } = state;
    const [r, g, b] = env.accent;
    ctx.font = `${Math.round(colW * 0.75)}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y += d.speed * env.speed * dt;
      if (d.y > env.height + d.chars.length * colW + 40) {
        d.y = rand(-100, 0);
        d.speed = rand(90, 220);
      }

      const x = i * colW;
      for (let c = 0; c < d.chars.length; c++) {
        const cy = d.y - c * colW;
        if (cy < -20 || cy > env.height + 20) continue;
        const head = c === 0;
        const alpha = head
          ? Math.min(1, env.intensity * 0.95)
          : Math.max(0.08, (1 - c / d.chars.length) * (env.isLightMode ? 0.8 : 0.6) * env.intensity);

        if (env.isLightMode) {
          ctx.fillStyle = head ? `rgba(${r},${g},${b},1)` : `rgba(${r},${g},${b},${alpha})`;
        } else {
          ctx.fillStyle = head ? `rgba(240,255,245,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
        }
        ctx.fillText(d.chars[c], x, cy);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 4. Firefly Swarm (Bioluminescent Organic Wanderers)                */
/* ------------------------------------------------------------------ */
const fireflySwarm: CanvasRenderer = {
  init(env) {
    const count = clampCount((env.width * env.height) / 20000, 18, 70, env);
    return {
      flies: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-14, 14),
        vy: rand(-14, 14),
        r: rand(2.4, 5.2),
        pulse: rand(0.6, 2.0),
        phase: rand(0, Math.PI * 2),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    for (const f of state.flies) {
      f.x += f.vx * env.speed * dt;
      f.y += f.vy * env.speed * dt;
      if (f.x < 0) { f.x = 0; f.vx = Math.abs(f.vx); }
      if (f.x > env.width) { f.x = env.width; f.vx = -Math.abs(f.vx); }
      if (f.y < 0) { f.y = 0; f.vy = Math.abs(f.vy); }
      if (f.y > env.height) { f.y = env.height; f.vy = -Math.abs(f.vy); }

      // Cursor gentle attraction
      if (ptr && ptr.isHovering) {
        const dx = ptr.x - f.x;
        const dy = ptr.y - f.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180 && dist > 1) {
          const force = (1 - dist / 180) * 25 * dt;
          f.x += (dx / dist) * force;
          f.y += (dy / dist) * force;
        }
      }

      const glow = 0.35 + 0.65 * Math.sin(t * f.pulse * env.speed + f.phase) ** 2;
      const alpha = glow * (env.isLightMode ? 0.9 : 0.8) * Math.min(1, env.intensity);

      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.8);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 5. Meteor Shower (Luminous Gradient Trails)                        */
/* ------------------------------------------------------------------ */
const meteorShower: CanvasRenderer = {
  init(env) {
    const count = clampCount(18, 8, 32, env);
    return {
      meteors: Array.from({ length: count }, () => ({
        x: rand(0, env.width * 1.5),
        y: rand(-env.height, 0),
        length: rand(70, 200),
        speed: rand(320, 640),
        alpha: rand(0.5, 0.95),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.18, dt);
    const [r, g, b] = env.accent;

    for (const m of state.meteors) {
      m.x -= m.speed * 0.7 * env.speed * dt;
      m.y += m.speed * 0.7 * env.speed * dt;

      if (m.y > env.height + 120 || m.x < -120) {
        m.x = rand(env.width * 0.2, env.width * 1.6);
        m.y = rand(-300, -50);
        m.speed = rand(320, 640);
      }

      const grad = ctx.createLinearGradient(m.x, m.y, m.x + m.length * 0.7, m.y - m.length * 0.7);
      if (env.isLightMode) {
        grad.addColorStop(0, `rgba(${r},${g},${b},${m.alpha * env.intensity})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${m.alpha * 0.6 * env.intensity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      } else {
        grad.addColorStop(0, `rgba(255,255,255,${m.alpha * env.intensity})`);
        grad.addColorStop(0.25, `rgba(${r},${g},${b},${m.alpha * 0.85 * env.intensity})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      }

      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.length * 0.7, m.y - m.length * 0.7);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 6. Circuit Flow (Cybernetic Data Packets)                          */
/* ------------------------------------------------------------------ */
const circuitFlow: CanvasRenderer = {
  init(env) {
    const grid = 50;
    const cols = Math.ceil(env.width / grid);
    const rows = Math.ceil(env.height / grid);
    return {
      grid,
      pulses: Array.from({ length: 22 }, () => ({
        x: Math.floor(rand(0, cols)) * grid,
        y: Math.floor(rand(0, rows)) * grid,
        dir: Math.floor(rand(0, 4)),
        len: 0,
        maxLen: rand(90, 220),
        speed: rand(140, 260),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.14, dt);
    const [r, g, b] = env.accent;

    for (const p of state.pulses) {
      p.len += p.speed * env.speed * dt;
      let nx = p.x;
      let ny = p.y;
      if (p.dir === 0) nx += p.len;
      if (p.dir === 1) ny += p.len;
      if (p.dir === 2) nx -= p.len;
      if (p.dir === 3) ny -= p.len;

      ctx.beginPath();
      ctx.arc(nx, ny, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.95 * env.intensity})`;
      ctx.fill();

      if (p.len > p.maxLen || nx < -20 || nx > env.width + 20 || ny < -20 || ny > env.height + 20) {
        p.x = Math.floor(rand(0, env.width / state.grid)) * state.grid;
        p.y = Math.floor(rand(0, env.height / state.grid)) * state.grid;
        p.dir = Math.floor(rand(0, 4));
        p.len = 0;
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 7. Rain on Glass (Refractive Droplet Condensation)                  */
/* ------------------------------------------------------------------ */
const rainGlass: CanvasRenderer = {
  init(env) {
    const count = clampCount(65, 25, 130, env);
    return {
      drops: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        len: rand(12, 32),
        speed: rand(420, 820),
        alpha: rand(0.25, 0.65),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.25, dt);
    const [r, g, b] = env.accent;

    // Batched raindrop stroke
    ctx.beginPath();
    for (const d of state.drops) {
      d.y += d.speed * env.speed * dt;
      if (d.y > env.height + 30) {
        d.y = rand(-40, 0);
        d.x = Math.random() * env.width;
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.5 : 0.35) * env.intensity})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  },
};

/* ------------------------------------------------------------------ */
/* 8. Quantum Flux (Harmonic Wave Interference)                       */
/* ------------------------------------------------------------------ */
const quantumFlux: CanvasRenderer = {
  init() {
    return {};
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const w = env.width;
    const h = env.height;

    for (let wave = 0; wave < 3; wave++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const yOffset =
          Math.sin(x * 0.008 + t * env.speed * 1.2 + wave) * 45 +
          Math.cos(x * 0.004 - t * env.speed * 0.8 + wave * 2) * 35;
        const y = h * 0.5 + yOffset;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${(0.42 - wave * 0.09) * env.intensity})`;
      ctx.lineWidth = 2.5 - wave * 0.5;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 9. Cyber Hologram Wireframe                                         */
/* ------------------------------------------------------------------ */
const cyberHologram: CanvasRenderer = {
  init() {
    return {};
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const horizon = env.height * 0.45;

    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = (env.width / 20) * i;
      ctx.moveTo(env.width * 0.5, horizon);
      ctx.lineTo(x, env.height);
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.28 : 0.2) * env.intensity})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    const speed = (t * env.speed * 60) % 40;
    for (let y = horizon; y < env.height; y += 25) {
      const cy = y + speed;
      if (cy > env.height) continue;
      const alpha = ((cy - horizon) / (env.height - horizon)) * (env.isLightMode ? 0.45 : 0.3) * env.intensity;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(env.width, cy);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 10. Solar Flare Plasma                                              */
/* ------------------------------------------------------------------ */
const solarFlare: CanvasRenderer = {
  init(env) {
    const count = clampCount(38, 15, 75, env);
    return {
      particles: Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: rand(60, 280),
        speed: rand(0.5, 1.8),
        size: rand(2.0, 5.5),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.15, dt);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
    grad.addColorStop(0, `rgba(255,220,150,${0.4 * env.intensity})`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},${0.25 * env.intensity})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 180, cy - 180, 360, 360);

    for (const p of state.particles) {
      p.angle += p.speed * env.speed * dt;
      const x = cx + Math.cos(p.angle) * p.dist;
      const y = cy + Math.sin(p.angle) * (p.dist * 0.65);

      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.75 * env.intensity})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 11. Bioluminescent Abyss                                            */
/* ------------------------------------------------------------------ */
const bioluminescentAbyss: CanvasRenderer = {
  init(env) {
    const count = clampCount(25, 10, 50, env);
    return {
      plankton: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        r: rand(3, 8),
        pulseSpeed: rand(0.8, 2.2),
        driftX: rand(-10, 10),
        driftY: rand(-15, -5),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;

    for (const p of state.plankton) {
      p.x += p.driftX * env.speed * dt;
      p.y += p.driftY * env.speed * dt;
      if (p.y < -30) p.y = env.height + 30;
      if (p.x < 0) { p.x = 0; p.driftX = Math.abs(p.driftX); }
      if (p.x > env.width) { p.x = env.width; p.driftX = -Math.abs(p.driftX); }

      const glow = (Math.sin(t * p.pulseSpeed * env.speed) + 1) * 0.5;
      const alpha = glow * (env.isLightMode ? 0.75 : 0.6) * env.intensity;

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 12. Warp Drive (Lightspeed Stardust Tunnel)                         */
/* ------------------------------------------------------------------ */
const warpDrive: CanvasRenderer = {
  init(env) {
    const count = clampCount(110, 40, 230, env);
    return {
      stars: Array.from({ length: count }, () => ({
        x: rand(-env.width * 0.5, env.width * 0.5),
        y: rand(-env.height * 0.5, env.height * 0.5),
        z: rand(10, env.width * 0.5),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.22, dt);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;

    for (const s of state.stars) {
      s.z -= 480 * env.speed * dt;
      if (s.z <= 0) {
        s.z = env.width * 0.5;
        s.x = rand(-cx, cx);
        s.y = rand(-cy, cy);
      }

      const k = 250 / s.z;
      const px = s.x * k + cx;
      const py = s.y * k + cy;

      if (px < -20 || px > env.width + 20 || py < -20 || py > env.height + 20) {
        s.z = env.width * 0.5;
        continue;
      }

      const alpha = Math.min(1, (1 - s.z / (env.width * 0.5)) * env.intensity);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.5, 2.5 * (1 - s.z / (env.width * 0.5))), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 13. Matrix Cyber Glitch Stream                                      */
/* ------------------------------------------------------------------ */
const matrixGlitch: CanvasRenderer = {
  init(env) {
    const cols = Math.floor(env.width / 18);
    return {
      cols,
      streams: Array.from({ length: cols }, () => ({
        y: rand(-env.height, 0),
        speed: rand(150, 350),
        chars: Array.from({ length: Math.floor(rand(8, 22)) }, () =>
          Math.random() < 0.5 ? '1' : '0'
        ),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    fade(ctx, env, 0.22, dt);
    const [r, g, b] = env.accent;
    ctx.font = '13px monospace';

    for (let i = 0; i < state.streams.length; i++) {
      const s = state.streams[i];
      s.y += s.speed * env.speed * dt;
      if (s.y > env.height + 200) {
        s.y = rand(-150, 0);
        s.speed = rand(150, 350);
      }

      const x = i * 18;
      // Random glitch slice displacement
      const glitchX = Math.sin(t * 10 + i) > 0.95 ? (Math.random() - 0.5) * 30 : 0;

      for (let c = 0; c < s.chars.length; c++) {
        const cy = s.y - c * 16;
        if (cy < -20 || cy > env.height + 20) continue;
        const head = c === 0;
        const alpha = head
          ? Math.min(1, env.intensity)
          : Math.max(0.1, (1 - c / s.chars.length) * 0.7 * env.intensity);

        if (env.isLightMode) {
          ctx.fillStyle = head ? '#0F172A' : `rgba(${r},${g},${b},${alpha})`;
        } else {
          ctx.fillStyle = head ? '#FFFFFF' : `rgba(${r},${g},${b},${alpha})`;
        }
        ctx.fillText(s.chars[c], x + glitchX, cy);
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 14. Fractal Sacred Mandala                                          */
/* ------------------------------------------------------------------ */
const fractalMandala: CanvasRenderer = {
  init() {
    return { rotation: 0 };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;
    state.rotation += 0.25 * env.speed * dt;

    const petals = 8;
    const maxRadius = Math.min(env.width, env.height) * 0.38;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation);

    for (let ring = 1; ring <= 4; ring++) {
      const radius = (maxRadius / 4) * ring;
      const alpha = (0.45 - ring * 0.08) * (env.isLightMode ? 1.2 : 1) * env.intensity;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1.5;

      for (let i = 0; i < petals * ring; i++) {
        const angle = ((Math.PI * 2) / (petals * ring)) * i + Math.sin(t * env.speed + ring) * 0.2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.arc(px, py, 12 + ring * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

/* ------------------------------------------------------------------ */
/* 15. Supernova Cosmic Burst                                          */
/* ------------------------------------------------------------------ */
const supernovaBurst: CanvasRenderer = {
  init(env) {
    const count = clampCount(60, 20, 100, env);
    return {
      rays: Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: rand(10, 350),
        speed: rand(40, 180),
        len: rand(30, 90),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.18, dt);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;

    for (const ray of state.rays) {
      ray.dist += ray.speed * env.speed * dt;
      if (ray.dist > Math.max(env.width, env.height) * 0.6) {
        ray.dist = rand(5, 40);
        ray.angle = Math.random() * Math.PI * 2;
      }

      const x1 = cx + Math.cos(ray.angle) * ray.dist;
      const y1 = cy + Math.sin(ray.angle) * ray.dist;
      const x2 = cx + Math.cos(ray.angle) * (ray.dist + ray.len);
      const y2 = cy + Math.sin(ray.angle) * (ray.dist + ray.len);

      const alpha = Math.max(0, (1 - ray.dist / (env.width * 0.5)) * 0.8 * env.intensity);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 16. Crystal Cavern Caustics                                         */
/* ------------------------------------------------------------------ */
const crystalCavern: CanvasRenderer = {
  init(env) {
    const count = 12;
    return {
      facets: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        size: rand(40, 120),
        rot: Math.random() * Math.PI * 2,
        rotSpeed: rand(-0.3, 0.3),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;

    for (const f of state.facets) {
      f.rot += f.rotSpeed * env.speed * dt;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);

      ctx.beginPath();
      ctx.moveTo(0, -f.size);
      ctx.lineTo(f.size * 0.86, f.size * 0.5);
      ctx.lineTo(-f.size * 0.86, f.size * 0.5);
      ctx.closePath();

      ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.35 : 0.25) * env.intensity})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = `rgba(${r},${g},${b},${0.04 * env.intensity})`;
      ctx.fill();
      ctx.restore();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 17. Synthwave 80s Highway                                           */
/* ------------------------------------------------------------------ */
const synthwaveHighway: CanvasRenderer = {
  init() {
    return { offset: 0 };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const horizon = env.height * 0.5;
    const cx = env.width * 0.5;

    // Glowing retro sun
    const sunRadius = 70;
    const sunGrad = ctx.createRadialGradient(cx, horizon - 20, 0, cx, horizon - 20, sunRadius);
    sunGrad.addColorStop(0, `rgba(255, 230, 150, ${0.8 * env.intensity})`);
    sunGrad.addColorStop(0.6, `rgba(${r},${g},${b}, ${0.5 * env.intensity})`);
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, horizon - 20, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Road perspective lines
    const lanes = 12;
    for (let i = -lanes; i <= lanes; i++) {
      const bottomX = cx + i * (env.width / (lanes * 1.5));
      ctx.beginPath();
      ctx.moveTo(cx, horizon);
      ctx.lineTo(bottomX, env.height);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.45 : 0.35) * env.intensity})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Moving horizontal grid slats
    state.offset = (state.offset + 80 * env.speed * dt) % 30;
    for (let y = horizon; y < env.height; y += 20) {
      const curY = y + state.offset;
      if (curY > env.height) continue;
      const alpha = ((curY - horizon) / (env.height - horizon)) * (env.isLightMode ? 0.6 : 0.5) * env.intensity;
      ctx.beginPath();
      ctx.moveTo(0, curY);
      ctx.lineTo(env.width, curY);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 18. Black Hole Accretion Disk                                       */
/* ------------------------------------------------------------------ */
const blackHoleSingularity: CanvasRenderer = {
  init(env) {
    const count = clampCount(120, 50, 200, env);
    return {
      diskParticles: Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: rand(50, 260),
        speed: rand(1.0, 3.5),
        size: rand(1.5, 3.5),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    fade(ctx, env, 0.2, dt);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;

    // Swirling accretion disk
    for (const p of state.diskParticles) {
      const orbitalSpeed = (p.speed * 200) / (p.dist + 20);
      p.angle += orbitalSpeed * env.speed * dt;

      const x = cx + Math.cos(p.angle) * p.dist;
      const y = cy + Math.sin(p.angle) * (p.dist * 0.35); // tilted ellipse

      const alpha = Math.min(1, (1 - p.dist / 280) * env.intensity);
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }

    // Black hole event horizon
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.fillStyle = env.isLightMode ? '#1E293B' : '#000000';
    ctx.fill();

    // Photon ring glow
    ctx.beginPath();
    ctx.arc(cx, cy, 37, 0, Math.PI * 2);
    ctx.strokeStyle = env.isLightMode ? `rgba(${r},${g},${b},${0.95 * env.intensity})` : `rgba(255, 255, 255, ${0.9 * env.intensity})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  },
};

/* ------------------------------------------------------------------ */
/* 19. Electric Plasma Storm (Hyper-Realistic Fractal Lightning)       */
/* ------------------------------------------------------------------ */
interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

interface ActiveBolt {
  segments: LightningSegment[];
  life: number;
  maxLife: number;
  flashX: number;
  flashY: number;
  flashIntensity: number;
}

function buildFractalLightning(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  displace: number,
  depth: number,
  maxDepth: number,
  thickness: number,
  segments: LightningSegment[],
  branchProb = 0.38
) {
  if (depth >= maxDepth || Math.hypot(x2 - x1, y2 - y1) < 8) {
    segments.push({ x1, y1, x2, y2, thickness: Math.max(0.8, thickness) });
    return;
  }

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const d = (Math.random() - 0.5) * displace;
  const cx = mx + nx * d;
  const cy = my + ny * d;

  buildFractalLightning(x1, y1, cx, cy, displace * 0.55, depth + 1, maxDepth, thickness, segments, branchProb);
  buildFractalLightning(cx, cy, x2, y2, displace * 0.55, depth + 1, maxDepth, thickness * 0.9, segments, branchProb);

  if (Math.random() < branchProb && depth < maxDepth - 1) {
    const angle = Math.atan2(dy, dx) + (Math.random() < 0.5 ? 1 : -1) * rand(0.3, 0.7);
    const branchLen = len * rand(0.35, 0.65);
    const bx = cx + Math.cos(angle) * branchLen;
    const by = cy + Math.sin(angle) * branchLen;
    buildFractalLightning(cx, cy, bx, by, displace * 0.45, depth + 1, maxDepth, thickness * 0.65, segments, branchProb * 0.5);
  }
}

const electricStorm: CanvasRenderer = {
  init(env) {
    const sparkCount = clampCount(30, 15, 60, env);
    return {
      bolts: [] as ActiveBolt[],
      sparks: Array.from({ length: sparkCount }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-35, 35),
        vy: rand(-20, 20),
        life: Math.random(),
        maxLife: rand(0.6, 1.8),
        size: rand(1.2, 2.8),
      })),
      lastBoltTime: 0,
      nextInterval: rand(0.6, 1.4),
      lastPointerStrike: 0,
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    // 1. Natural lightning strike generator
    if (t - state.lastBoltTime > state.nextInterval / env.speed) {
      state.lastBoltTime = t;
      state.nextInterval = rand(0.7, 1.8);

      const isCloudToCloud = Math.random() < 0.35;
      const x1 = rand(env.width * 0.1, env.width * 0.9);
      const y1 = isCloudToCloud ? rand(0, env.height * 0.3) : 0;
      const x2 = isCloudToCloud ? rand(env.width * 0.1, env.width * 0.9) : rand(env.width * 0.15, env.width * 0.85);
      const y2 = isCloudToCloud ? rand(0, env.height * 0.4) : env.height;

      const segments: LightningSegment[] = [];
      buildFractalLightning(x1, y1, x2, y2, 85, 0, 6, rand(2.5, 4.0), segments);

      state.bolts.push({
        segments,
        life: 1.0,
        maxLife: rand(0.18, 0.32),
        flashX: x1,
        flashY: y1,
        flashIntensity: rand(0.7, 1.0),
      });
    }

    // 2. Interactive lightning towards cursor
    if (ptr && ptr.isHovering && (ptr.isDown || Math.random() < 0.04)) {
      if (t - state.lastPointerStrike > (ptr.isDown ? 0.08 : 0.25)) {
        state.lastPointerStrike = t;
        const originX = rand(0, 1) < 0.5 ? rand(0, env.width) : (Math.random() < 0.5 ? 0 : env.width);
        const originY = rand(0, env.height * 0.25);
        const segments: LightningSegment[] = [];
        buildFractalLightning(originX, originY, ptr.x, ptr.y, 60, 0, 5, ptr.isDown ? 3.5 : 2.0, segments, 0.45);
        state.bolts.push({
          segments,
          life: 1.0,
          maxLife: ptr.isDown ? 0.28 : 0.15,
          flashX: ptr.x,
          flashY: ptr.y,
          flashIntensity: ptr.isDown ? 0.95 : 0.5,
        });
      }
    }

    // 3. Render ambient atmospheric lightning flashes
    for (const bolt of state.bolts) {
      if (bolt.life > 0.6) {
        const flashAlpha = ((bolt.life - 0.6) / 0.4) * bolt.flashIntensity * (env.isLightMode ? 0.12 : 0.22) * env.intensity;
        const grad = ctx.createRadialGradient(bolt.flashX, bolt.flashY, 0, bolt.flashX, bolt.flashY, Math.max(env.width, env.height) * 0.7);
        grad.addColorStop(0, `rgba(${r},${g},${b},${flashAlpha})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${flashAlpha * 0.4})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, env.width, env.height);
      }
    }

    // 4. Render active lightning bolts with multi-pass neon bloom & ionization strobe
    for (let i = state.bolts.length - 1; i >= 0; i--) {
      const bolt = state.bolts[i];
      bolt.life -= dt / bolt.maxLife;

      if (bolt.life <= 0) {
        state.bolts.splice(i, 1);
        continue;
      }

      // High-frequency ionization strobe
      const strobe = Math.sin(bolt.life * 55) > -0.2 ? 1 : 0.35;
      const alpha = bolt.life * strobe * Math.min(1, env.intensity);

      // Pass 1: Wide outer plasma halo
      ctx.beginPath();
      for (const seg of bolt.segments) {
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.25})`;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Pass 2: Saturated electric glow
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.85})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Pass 3: Ultra-bright hot core filament
      ctx.strokeStyle = env.isLightMode ? `rgba(255, 255, 255, ${alpha * 0.95})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // 5. Ambient floating plasma sparks
    for (const sp of state.sparks) {
      sp.x += sp.vx * env.speed * dt;
      sp.y += sp.vy * env.speed * dt;
      sp.life += dt / sp.maxLife;

      if (sp.life >= 1.0 || sp.x < 0 || sp.x > env.width || sp.y < 0 || sp.y > env.height) {
        sp.x = Math.random() * env.width;
        sp.y = Math.random() * env.height;
        sp.vx = rand(-35, 35);
        sp.vy = rand(-20, 20);
        sp.life = 0;
      }

      const sparkAlpha = Math.sin(sp.life * Math.PI) * (env.isLightMode ? 0.6 : 0.75) * env.intensity;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${sparkAlpha})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 20. Sakura Petal Drift                                              */
/* ------------------------------------------------------------------ */
const sakuraFall: CanvasRenderer = {
  init(env) {
    const count = clampCount(35, 15, 60, env);
    return {
      petals: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(25, 65),
        vy: rand(35, 85),
        rot: Math.random() * Math.PI * 2,
        rotSpeed: rand(-2, 2),
        size: rand(6, 12),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;

    for (const p of state.petals) {
      p.x += p.vx * env.speed * dt;
      p.y += p.vy * env.speed * dt;
      p.rot += p.rotSpeed * env.speed * dt;

      if (p.y > env.height + 30) {
        p.y = -30;
        p.x = Math.random() * (env.width + 60) - 30;
      }
      if (p.x > env.width + 30) {
        p.x = -30;
        p.y = Math.random() * (env.height + 60) - 30;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.8 : 0.65) * env.intensity})`;
      ctx.fill();
      ctx.restore();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 21. Cosmic Galaxy Vortex (3D Rotating Spiral Galaxy)               */
/* ------------------------------------------------------------------ */
const cosmicStars: CanvasRenderer = {
  init(env) {
    const count = clampCount(160, 60, 280, env);
    const armCount = 2;
    return {
      stars: Array.from({ length: count }, (_, i) => {
        const arm = i % armCount;
        const armOffset = (arm * (Math.PI * 2)) / armCount;
        const dist = Math.pow(Math.random(), 1.6) * Math.min(env.width, env.height) * 0.45 + 10;
        const spiralAngle = dist * 0.015 + armOffset + rand(-0.35, 0.35);
        return {
          dist,
          angle: spiralAngle,
          baseSpeed: 140 / (dist + 30),
          r: rand(0.8, 2.4),
          twinkle: rand(0.5, 2.0),
          isCore: dist < 50,
        };
      }),
      dustClouds: Array.from({ length: 8 }, () => ({
        dist: rand(30, Math.min(env.width, env.height) * 0.38),
        angle: Math.random() * Math.PI * 2,
        speed: rand(0.15, 0.4),
        radius: rand(45, 90),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const cx = env.width * 0.5;
    const cy = env.height * 0.5;
    const ptr = env.pointer;

    // 1. Galactic Core Bulge & Nebular Glow
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(env.width, env.height) * 0.4);
    coreGrad.addColorStop(0, `rgba(${r},${g},${b},${(env.isLightMode ? 0.35 : 0.28) * env.intensity})`);
    coreGrad.addColorStop(0.3, `rgba(${r},${g},${b},${(env.isLightMode ? 0.12 : 0.10) * env.intensity})`);
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(env.width, env.height) * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Swirling Dust Clouds
    for (const d of state.dustClouds) {
      d.angle += d.speed * 0.3 * env.speed * dt;
      const x = cx + Math.cos(d.angle) * d.dist;
      const y = cy + Math.sin(d.angle) * (d.dist * 0.55);
      const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, d.radius);
      cloudGrad.addColorStop(0, `rgba(${r},${g},${b},${0.06 * env.intensity})`);
      cloudGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = cloudGrad;
      ctx.beginPath();
      ctx.arc(x, y, d.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Batched Spiral Stars & Cursor Warping
    for (const s of state.stars) {
      s.angle += s.baseSpeed * 0.25 * env.speed * dt;
      let x = cx + Math.cos(s.angle) * s.dist;
      let y = cy + Math.sin(s.angle) * (s.dist * 0.55);

      if (ptr && ptr.isHovering) {
        const dx = ptr.x - x;
        const dy = ptr.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140 && dist > 1) {
          const force = (1 - dist / 140) * 35 * dt;
          x += (dx / dist) * force;
          y += (dy / dist) * force;
        }
      }

      const twinkle = 0.4 + 0.6 * Math.sin(t * s.twinkle + s.dist) ** 2;
      const alpha = twinkle * (s.isCore ? 0.95 : 0.75) * env.intensity;

      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      if (env.isLightMode) {
        ctx.fillStyle = s.isCore ? '#0F172A' : `rgba(${r},${g},${b},${alpha})`;
      } else {
        ctx.fillStyle = s.isCore ? '#FFFFFF' : `rgba(${r},${g},${b},${alpha})`;
      }
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 22. Cosmic Nebula Nursery (Volumetric Multi-Spectral Clouds)       */
/* ------------------------------------------------------------------ */
const nebulaSmoke: CanvasRenderer = {
  init(env) {
    const count = 16;
    return {
      blobs: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-12, 12),
        vy: rand(-12, 12),
        r: rand(90, 220),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.4, 1.2),
      })),
      stars: Array.from({ length: 45 }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        r: rand(0.6, 1.8),
        twinkle: rand(0.6, 2.4),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    fade(ctx, env, 0.12, dt);
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    // Render volumetric gas clouds
    for (const b_node of state.blobs) {
      b_node.x += b_node.vx * env.speed * dt;
      b_node.y += b_node.vy * env.speed * dt;

      if (b_node.x < -100) b_node.x = env.width + 100;
      if (b_node.x > env.width + 100) b_node.x = -100;
      if (b_node.y < -100) b_node.y = env.height + 100;
      if (b_node.y > env.height + 100) b_node.y = -100;

      if (ptr && ptr.isHovering) {
        const dx = b_node.x - ptr.x;
        const dy = b_node.y - ptr.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 200 && dist > 1) {
          const force = (1 - dist / 200) * 45 * dt;
          b_node.x += (dx / dist) * force;
          b_node.y += (dy / dist) * force;
        }
      }

      const pulse = 0.7 + 0.3 * Math.sin(t * b_node.speed + b_node.phase);
      const alpha = (env.isLightMode ? 0.08 : 0.12) * pulse * env.intensity;

      const grad = ctx.createRadialGradient(b_node.x, b_node.y, 0, b_node.x, b_node.y, b_node.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.6, `rgba(${r},${g},${b},${alpha * 0.35})`);
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b_node.x, b_node.y, b_node.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render embedded twinkle stars
    for (const s of state.stars) {
      const alpha = (0.3 + 0.7 * Math.sin(t * s.twinkle) ** 2) * env.intensity;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = env.isLightMode ? `rgba(${r},${g},${b},${alpha * 0.9})` : `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 23. Cyberpunk Neon Terrain (3D Undulating Wave Grid)                */
/* ------------------------------------------------------------------ */
const cyberpunkGrid: CanvasRenderer = {
  init() {
    return { offset: 0 };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const horizon = env.height * 0.42;
    const cols = 22;
    const rows = 18;
    const ptr = env.pointer;

    state.offset = (state.offset + 50 * env.speed * dt) % 30;

    // Glowing Retro Vector Sun
    const sunRadius = 65;
    const cx = env.width * 0.5;
    const sunGrad = ctx.createRadialGradient(cx, horizon - 15, 0, cx, horizon - 15, sunRadius);
    sunGrad.addColorStop(0, `rgba(255, 235, 160, ${0.9 * env.intensity})`);
    sunGrad.addColorStop(0.5, `rgba(${r},${g},${b}, ${0.6 * env.intensity})`);
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, horizon - 15, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3D Perspective Grid Columns with Height Spectrum Waves
    for (let i = 0; i <= cols; i++) {
      const pct = (i - cols / 2) / (cols / 2);
      ctx.beginPath();
      for (let j = 0; j <= rows; j++) {
        const depth = j / rows;
        const y = horizon + Math.pow(depth, 1.8) * (env.height - horizon);
        const spread = (pct * env.width * 0.6) * (1 + depth * 2.2);
        const wave = Math.sin(pct * 6 + t * env.speed * 2 + depth * 8) * 16 * depth;

        let py = y + wave;
        const px = cx + spread;

        if (ptr && ptr.isHovering) {
          const dist = Math.hypot(px - ptr.x, py - ptr.y);
          if (dist < 120) {
            py -= (1 - dist / 120) * 25;
          }
        }

        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.35 : 0.22) * env.intensity})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Moving Horizontal Latitude Slices
    for (let j = 1; j <= rows; j++) {
      const depth = j / rows;
      const curY = horizon + Math.pow(depth, 1.8) * (env.height - horizon);
      const alpha = depth * (env.isLightMode ? 0.55 : 0.4) * env.intensity;

      ctx.beginPath();
      const leftX = cx - (env.width * 0.6) * (1 + depth * 2.2);
      const rightX = cx + (env.width * 0.6) * (1 + depth * 2.2);
      ctx.moveTo(leftX, curY);
      ctx.lineTo(rightX, curY);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 24. Grid Pulse Hyper-Highway (Laser Beams & Data Towers)           */
/* ------------------------------------------------------------------ */
const gridPulse: CanvasRenderer = {
  init() {
    return {
      pulses: Array.from({ length: 10 }, () => ({
        depth: Math.random(),
        lane: Math.floor(rand(-6, 7)),
        speed: rand(0.4, 1.1),
        len: rand(0.08, 0.2),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const horizon = env.height * 0.45;
    const cx = env.width * 0.5;

    // Road Grid Perspective
    const lanes = 14;
    for (let i = -lanes; i <= lanes; i++) {
      const bottomX = cx + i * (env.width / (lanes * 1.4));
      ctx.beginPath();
      ctx.moveTo(cx, horizon);
      ctx.lineTo(bottomX, env.height);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(env.isLightMode ? 0.25 : 0.16) * env.intensity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Traveling Laser Pulses
    for (const p of state.pulses) {
      p.depth += p.speed * env.speed * dt;
      if (p.depth > 1.2) {
        p.depth = 0;
        p.lane = Math.floor(rand(-lanes, lanes + 1));
        p.speed = rand(0.4, 1.1);
      }

      const y1 = horizon + Math.pow(Math.max(0, p.depth - p.len), 2) * (env.height - horizon);
      const y2 = horizon + Math.pow(Math.min(1, p.depth), 2) * (env.height - horizon);
      const x1 = cx + (p.lane * (env.width / (lanes * 1.4))) * Math.max(0, p.depth - p.len);
      const x2 = cx + (p.lane * (env.width / (lanes * 1.4))) * Math.min(1, p.depth);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${p.depth * (env.isLightMode ? 0.9 : 0.8) * env.intensity})`;
      ctx.lineWidth = 2.5 * p.depth + 1;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 25. Liquid Aurora Plasma (Flowing Magnetic Ribbons)                 */
/* ------------------------------------------------------------------ */
const liquidAurora: CanvasRenderer = {
  init() {
    return {};
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const w = env.width;
    const h = env.height;
    const ptr = env.pointer;

    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      ctx.moveTo(0, h);

      for (let x = 0; x <= w; x += 12) {
        let y =
          h * 0.35 +
          layer * 45 +
          Math.sin(x * 0.005 + t * env.speed * 0.8 + layer) * 55 +
          Math.cos(x * 0.003 - t * env.speed * 0.6 + layer * 1.5) * 40;

        if (ptr && ptr.isHovering) {
          const dist = Math.hypot(x - ptr.x, y - ptr.y);
          if (dist < 150) {
            y += (1 - dist / 150) * 40;
          }
        }

        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      const alpha = (0.16 - layer * 0.03) * (env.isLightMode ? 1.3 : 1) * env.intensity;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();

      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 1.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 26. Aurora Borealis Curtains (Volumetric Polar Drapery)              */
/* ------------------------------------------------------------------ */
const auroraBorealis: CanvasRenderer = {
  init() {
    return {};
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const w = env.width;
    const h = env.height;
    const rays = 36;

    for (let i = 0; i < rays; i++) {
      const x = (w / rays) * i;
      const wave = Math.sin(i * 0.25 + t * env.speed * 0.7) * 50;
      const topY = h * 0.1 + wave;
      const botY = h * 0.65 + Math.cos(i * 0.2 - t * env.speed * 0.5) * 60;

      const grad = ctx.createLinearGradient(x, topY, x, botY);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${(env.isLightMode ? 0.32 : 0.25) * env.intensity})`);
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, botY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = w / rays + 4;
      ctx.stroke();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 27. Deep Ocean Caustics (Sun God-Rays & Marine Spores)              */
/* ------------------------------------------------------------------ */
const deepOcean: CanvasRenderer = {
  init(env) {
    const count = clampCount(40, 15, 75, env);
    return {
      spores: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-6, 6),
        vy: rand(-12, -2),
        r: rand(1.5, 3.8),
        pulse: rand(0.5, 1.8),
      })),
    };
  },
  frame(ctx, state, env, dt, t) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    // Volumetric God-Rays from Surface
    for (let ray = 0; ray < 4; ray++) {
      const startX = env.width * (0.2 + ray * 0.2) + Math.sin(t * env.speed * 0.4 + ray) * 60;
      const endX = startX + 180;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX + 90, 0);
      ctx.lineTo(endX + 140, env.height);
      ctx.lineTo(endX, env.height);
      ctx.closePath();

      const rayGrad = ctx.createLinearGradient(startX, 0, endX, env.height);
      rayGrad.addColorStop(0, `rgba(${r},${g},${b},${(env.isLightMode ? 0.18 : 0.12) * env.intensity})`);
      rayGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = rayGrad;
      ctx.fill();
    }

    // Floating Marine Plankton Spores
    for (const s of state.spores) {
      s.x += s.vx * env.speed * dt;
      s.y += s.vy * env.speed * dt;

      if (s.y < -20) s.y = env.height + 20;
      if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
      if (s.x > env.width) { s.x = env.width; s.vx = -Math.abs(s.vx); }

      if (ptr && ptr.isHovering) {
        const dx = s.x - ptr.x;
        const dy = s.y - ptr.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 130 && dist > 1) {
          const force = (1 - dist / 130) * 35 * dt;
          s.x += (dx / dist) * force;
          s.y += (dy / dist) * force;
        }
      }

      const glow = (Math.sin(t * s.pulse * env.speed) + 1) * 0.5;
      const alpha = (0.2 + glow * 0.6) * (env.isLightMode ? 0.8 : 0.65) * env.intensity;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 28. Fluid Metaballs Morph (Liquid Surface Tension Physics)         */
/* ------------------------------------------------------------------ */
const meshMorph: CanvasRenderer = {
  init(env) {
    const count = 10;
    return {
      balls: Array.from({ length: count }, () => ({
        x: Math.random() * env.width,
        y: Math.random() * env.height,
        vx: rand(-25, 25),
        vy: rand(-25, 25),
        r: rand(60, 140),
      })),
    };
  },
  frame(ctx, state, env, dt) {
    ctx.clearRect(0, 0, env.width, env.height);
    const [r, g, b] = env.accent;
    const ptr = env.pointer;

    for (const mb of state.balls) {
      mb.x += mb.vx * env.speed * dt;
      mb.y += mb.vy * env.speed * dt;

      if (mb.x < mb.r) { mb.x = mb.r; mb.vx = Math.abs(mb.vx); }
      if (mb.x > env.width - mb.r) { mb.x = env.width - mb.r; mb.vx = -Math.abs(mb.vx); }
      if (mb.y < mb.r) { mb.y = mb.r; mb.vy = Math.abs(mb.vy); }
      if (mb.y > env.height - mb.r) { mb.y = env.height - mb.r; mb.vy = -Math.abs(mb.vy); }

      if (ptr && ptr.isHovering) {
        const dx = mb.x - ptr.x;
        const dy = mb.y - ptr.y;
        const dist = Math.hypot(dx, dy);
        if (dist < mb.r + 80 && dist > 1) {
          const force = (1 - dist / (mb.r + 80)) * 65 * dt;
          mb.x += (dx / dist) * force;
          mb.y += (dy / dist) * force;
        }
      }

      const grad = ctx.createRadialGradient(mb.x, mb.y, 0, mb.x, mb.y, mb.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${(env.isLightMode ? 0.3 : 0.22) * env.intensity})`);
      grad.addColorStop(0.6, `rgba(${r},${g},${b},${(env.isLightMode ? 0.1 : 0.08) * env.intensity})`);
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mb.x, mb.y, mb.r, 0, Math.PI * 2);
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
  'quantum-flux': quantumFlux,
  'cyber-hologram': cyberHologram,
  'solar-flare': solarFlare,
  'bioluminescent-abyss': bioluminescentAbyss,
  'warp-drive': warpDrive,
  'matrix-glitch': matrixGlitch,
  'fractal-mandala': fractalMandala,
  'supernova-burst': supernovaBurst,
  'crystal-cavern': crystalCavern,
  'synthwave-highway': synthwaveHighway,
  'black-hole-singularity': blackHoleSingularity,
  'electric-storm': electricStorm,
  'sakura-fall': sakuraFall,
  'cosmic-stars': cosmicStars,
  'nebula-smoke': nebulaSmoke,
  'cyberpunk-grid': cyberpunkGrid,
  'grid-pulse': gridPulse,
  'liquid-aurora': liquidAurora,
  'aurora-borealis': auroraBorealis,
  'deep-ocean': deepOcean,
  'mesh-morph': meshMorph,
};
