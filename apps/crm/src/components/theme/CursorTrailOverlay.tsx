'use client';

import React, { useEffect, useRef } from 'react';
import {
  ACCENT_RGB,
  type AccentColor,
  type CursorTrailMode,
  type ClickEffectMode,
  type CursorHaloMode,
  type ClickSoundMode,
} from './themeRegistry';
import { playClickSound } from './audioSynth';

interface CursorTrailOverlayProps {
  trailMode: CursorTrailMode;
  clickEffect: ClickEffectMode;
  haloMode?: CursorHaloMode;
  clickSound?: ClickSoundMode;
  soundVolume?: number;
  trailLength?: number;
  rippleIntensity?: number;
  accent: AccentColor;
  enabled?: boolean;
}

interface TrailPoint {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life: number;
  maxLife: number;
  size: number;
  char?: string;
  angle?: number;
  hue?: number;
  rot?: number;
  rotSpeed?: number;
}

interface ClickParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  w?: number;
  h?: number;
  rot?: number;
  rotSpeed?: number;
  life: number;
  maxLife: number;
  color: string;
  type?: 'circle' | 'rect' | 'shard';
}

interface ClickWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  phase?: number;
  arcs?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  kind?: 'ring' | 'implosion' | 'magnetic';
}

export default function CursorTrailOverlay({
  trailMode = 'none',
  clickEffect = 'none',
  haloMode = 'none',
  clickSound = 'none',
  soundVolume = 0.5,
  trailLength = 20,
  rippleIntensity = 1.0,
  accent = 'orange',
  enabled = true,
}: CursorTrailOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || (trailMode === 'none' && clickEffect === 'none' && haloMode === 'none')) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let last = performance.now();
    let dpr = 1;

    const mouse = { x: -1000, y: -1000, smoothX: -1000, smoothY: -1000, isDown: false, isHovering: false };
    const trail: TrailPoint[] = [];
    const clickParticles: ClickParticle[] = [];
    const clickWaves: ClickWave[] = [];
    let rainbowHue = 0;

    const setup = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (mouse.smoothX < -500) {
        mouse.smoothX = e.clientX;
        mouse.smoothY = e.clientY;
      }
      mouse.isHovering = true;
      rainbowHue = (rainbowHue + 8) % 360;

      // 1. STARDUST
      if (trailMode === 'stardust') {
        trail.push({
          x: e.clientX + (Math.random() - 0.5) * 8,
          y: e.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 25,
          vy: (Math.random() - 0.5) * 25,
          life: 1.0,
          maxLife: 0.6,
          size: Math.random() * 2.8 + 1,
        });
      }
      // 2. NEON PLASMA
      else if (trailMode === 'neon-plasma') {
        trail.push({
          x: e.clientX,
          y: e.clientY,
          life: 1.0,
          maxLife: 0.45,
          size: Math.random() * 4 + 2.5,
        });
      }
      // 3. CYBER MATRIX
      else if (trailMode === 'cyber-matrix') {
        if (Math.random() < 0.65) {
          trail.push({
            x: e.clientX + (Math.random() - 0.5) * 18,
            y: e.clientY,
            vy: Math.random() * 70 + 50,
            life: 1.0,
            maxLife: 0.85,
            size: 11,
            char: Math.random() < 0.5 ? '1' : '0',
          });
        }
      }
      // 4. FLUID SMOKE
      else if (trailMode === 'fluid-smoke') {
        trail.push({
          x: e.clientX,
          y: e.clientY,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18,
          life: 1.0,
          maxLife: 0.95,
          size: Math.random() * 9 + 4,
        });
      }
      // 5. RAINBOW SPARKLER
      else if (trailMode === 'rainbow-sparkler') {
        for (let i = 0; i < 2; i++) {
          trail.push({
            x: e.clientX + (Math.random() - 0.5) * 6,
            y: e.clientY + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 45,
            vy: (Math.random() - 0.5) * 45,
            life: 1.0,
            maxLife: 0.55,
            size: Math.random() * 3 + 1.2,
            hue: (rainbowHue + i * 30) % 360,
          });
        }
      }
      // 6. FIRE FLAME
      else if (trailMode === 'fire-flame') {
        trail.push({
          x: e.clientX + (Math.random() - 0.5) * 12,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 20,
          vy: -Math.random() * 65 - 30,
          life: 1.0,
          maxLife: 0.7,
          size: Math.random() * 5 + 2,
        });
      }
      // 7. LIGHTNING TENDRILS (Plasma Tendril Arcs)
      else if (trailMode === 'lightning-tendrils') {
        const count = Math.random() < 0.75 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 50 + 20;
          trail.push({
            x: e.clientX + Math.cos(angle) * dist,
            y: e.clientY + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 50,
            vy: (Math.random() - 0.5) * 50,
            life: 1.0,
            maxLife: Math.random() * 0.25 + 0.18,
            size: Math.random() * 2 + 1,
          });
        }
      }
      // 8. CRYSTAL PRISM
      else if (trailMode === 'crystal-prism') {
        trail.push({
          x: e.clientX,
          y: e.clientY,
          vx: (Math.random() - 0.5) * 22,
          vy: (Math.random() - 0.5) * 22,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 5,
          life: 1.0,
          maxLife: 0.8,
          size: Math.random() * 8 + 5,
        });
      }
      // 9. BUBBLE FLOAT
      else if (trailMode === 'bubble-float') {
        if (Math.random() < 0.55) {
          trail.push({
            x: e.clientX + (Math.random() - 0.5) * 14,
            y: e.clientY,
            vx: (Math.random() - 0.5) * 15,
            vy: -Math.random() * 35 - 15,
            life: 1.0,
            maxLife: 1.1,
            size: Math.random() * 7 + 4,
          });
        }
      }
      // 10. HYPER WARP
      else if (trailMode === 'hyper-warp') {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 120 + 60;
        trail.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          maxLife: 0.4,
          size: Math.random() * 18 + 10,
          angle,
        });
      }

      if (trail.length > trailLength * 3) {
        trail.splice(0, trail.length - trailLength * 3);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      mouse.isDown = true;
      playClickSound(clickSound, soundVolume);
      const [r, g, b] = ACCENT_RGB[accent] || [255, 122, 69];

      // 1. SHOCKWAVE RING
      if (clickEffect === 'shockwave-ring') {
        clickWaves.push({
          x: e.clientX,
          y: e.clientY,
          radius: 0,
          maxRadius: 180 * rippleIntensity,
          opacity: 1.0,
          kind: 'ring',
        });
      }
      // 2. PARTICLE BURST
      else if (clickEffect === 'particle-burst') {
        const count = Math.round(30 * rippleIntensity);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 260 + 90;
          clickParticles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 3.5 + 1.5,
            life: 1.0,
            maxLife: Math.random() * 0.55 + 0.35,
            color: `rgba(${r},${g},${b},1)`,
            type: 'circle',
          });
        }
      }
      // 3. RIPPLE DISTORTION
      else if (clickEffect === 'ripple-distortion') {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            clickWaves.push({
              x: e.clientX,
              y: e.clientY,
              radius: 0,
              maxRadius: (130 + i * 45) * rippleIntensity,
              opacity: 0.85 - i * 0.2,
              kind: 'ring',
            });
          }, i * 65);
        }
      }
      // 4. ELECTRIC ARC (Fractal Branching Lightning Blast)
      else if (clickEffect === 'electric-arc') {
        const arcs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        const numBolts = Math.round(10 * rippleIntensity);
        for (let i = 0; i < numBolts; i++) {
          let cx = e.clientX;
          let cy = e.clientY;
          const baseAngle = (Math.PI * 2 * i) / numBolts + (Math.random() - 0.5) * 0.4;
          const boltLen = Math.random() * 65 + 45;
          const segCount = 6;
          const step = boltLen / segCount;
          for (let seg = 0; seg < segCount; seg++) {
            const nx = cx + Math.cos(baseAngle) * step + (Math.random() - 0.5) * 16;
            const ny = cy + Math.sin(baseAngle) * step + (Math.random() - 0.5) * 16;
            arcs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
            // Occasional fork
            if (Math.random() < 0.45 && seg < segCount - 1) {
              const forkAngle = baseAngle + (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 0.6 + 0.3);
              const fx = nx + Math.cos(forkAngle) * (step * 0.75) + (Math.random() - 0.5) * 10;
              const fy = ny + Math.sin(forkAngle) * (step * 0.75) + (Math.random() - 0.5) * 10;
              arcs.push({ x1: nx, y1: ny, x2: fx, y2: fy });
            }
            cx = nx;
            cy = ny;
          }
        }
        clickWaves.push({
          x: e.clientX,
          y: e.clientY,
          radius: 0,
          maxRadius: 140 * rippleIntensity,
          opacity: 1.0,
          arcs,
          kind: 'ring',
        });
        // Accompanying electric plasma sparks
        const sparkCount = Math.round(18 * rippleIntensity);
        for (let i = 0; i < sparkCount; i++) {
          const spAngle = Math.random() * Math.PI * 2;
          const spSpeed = Math.random() * 220 + 60;
          clickParticles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(spAngle) * spSpeed,
            vy: Math.sin(spAngle) * spSpeed,
            size: Math.random() * 2.2 + 1,
            life: 1.0,
            maxLife: Math.random() * 0.4 + 0.2,
            color: `rgba(${r},${g},${b},0.9)`,
            type: 'circle',
          });
        }
      }
      // 5. SUPERNOVA IMPLOSION
      else if (clickEffect === 'supernova-implosion') {
        clickWaves.push({
          x: e.clientX,
          y: e.clientY,
          radius: 80 * rippleIntensity,
          maxRadius: 220 * rippleIntensity,
          opacity: 1.0,
          kind: 'implosion',
          phase: 0,
        });
        setTimeout(() => {
          const count = Math.round(35 * rippleIntensity);
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 320 + 120;
            clickParticles.push({
              x: e.clientX,
              y: e.clientY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: Math.random() * 4 + 1.5,
              life: 1.0,
              maxLife: 0.6,
              color: Math.random() < 0.5 ? '#FFFFFF' : `rgba(${r},${g},${b},1)`,
              type: 'circle',
            });
          }
        }, 120);
      }
      // 6. CONFETTI BLAST
      else if (clickEffect === 'confetti-blast') {
        const count = Math.round(40 * rippleIntensity);
        const palette = [
          `rgb(${r},${g},${b})`,
          '#F59E0B',
          '#10B981',
          '#06B6D4',
          '#EC4899',
          '#8B5CF6',
          '#FFFFFF',
        ];
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 280 + 100;
          clickParticles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60,
            w: Math.random() * 8 + 4,
            h: Math.random() * 5 + 3,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 12,
            size: 4,
            life: 1.0,
            maxLife: Math.random() * 0.8 + 0.5,
            color: palette[Math.floor(Math.random() * palette.length)],
            type: 'rect',
          });
        }
      }
      // 7. QUANTUM SHATTER
      else if (clickEffect === 'quantum-shatter') {
        const count = Math.round(25 * rippleIntensity);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 220 + 80;
          clickParticles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 8,
            size: Math.random() * 9 + 4,
            life: 1.0,
            maxLife: Math.random() * 0.5 + 0.4,
            color: `rgba(${r},${g},${b},0.8)`,
            type: 'shard',
          });
        }
      }
      // 8. MAGNETIC PULSE
      else if (clickEffect === 'magnetic-pulse') {
        for (let i = 0; i < 4; i++) {
          clickWaves.push({
            x: e.clientX,
            y: e.clientY,
            radius: i * 20,
            maxRadius: (150 + i * 30) * rippleIntensity,
            opacity: 1.0,
            kind: 'magnetic',
          });
        }
      }
    };

    const onMouseUp = () => {
      mouse.isDown = false;
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;

      // Clean physical buffer wipe with 100% edge coverage
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const [r, g, b] = ACCENT_RGB[accent] || [255, 122, 69];

      // Smooth pointer spring tracking
      mouse.smoothX += (mouse.x - mouse.smoothX) * 0.25;
      mouse.smoothY += (mouse.y - mouse.smoothY) * 0.25;

      // -------------------------------------------------------------
      // 1. RENDER POINTER HALO / RETICLE
      // -------------------------------------------------------------
      if (mouse.isHovering) {
        if (haloMode === 'halo-glow') {
          const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 50);
          grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
          grad.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
          grad.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 50, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        } else if (haloMode === 'tech-crosshair') {
          const angle = now * 0.002;
          ctx.save();
          ctx.translate(mouse.x, mouse.y);
          ctx.rotate(angle);

          ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, 18, 0, Math.PI * 0.6);
          ctx.arc(0, 0, 18, Math.PI, Math.PI * 1.6);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(-24, 0);
          ctx.lineTo(-12, 0);
          ctx.moveTo(12, 0);
          ctx.lineTo(24, 0);
          ctx.moveTo(0, -24);
          ctx.lineTo(0, -12);
          ctx.moveTo(0, 12);
          ctx.lineTo(0, 24);
          ctx.stroke();
          ctx.restore();
        } else if (haloMode === 'magnetic-dot') {
          // Inner immediate dot
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
          ctx.fill();

          // Outer delayed tracking ring
          ctx.beginPath();
          ctx.arc(mouse.smoothX, mouse.smoothY, 16, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (haloMode === 'cyber-pulse') {
          const pulse = (Math.sin(now * 0.006) + 1) * 3 + 14;
          ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(mouse.x - pulse, mouse.y - pulse, pulse * 2, pulse * 2);
        }
      }

      // -------------------------------------------------------------
      // 2. RENDER CURSOR TRAILS
      // -------------------------------------------------------------
      if (trailMode === 'stardust' || trailMode === 'rainbow-sparkler') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          if (p.hue !== undefined) {
            ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.life * 0.9})`;
            ctx.shadowColor = `hsla(${p.hue}, 95%, 60%, 0.8)`;
          } else {
            ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.85})`;
            ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
          }
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (trailMode === 'neon-plasma' && trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},0.65)`;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (let i = trail.length - 1; i >= 0; i--) {
          trail[i].life -= dt / trail[i].maxLife;
          if (trail[i].life <= 0) trail.splice(i, 1);
        }
      } else if (trailMode === 'cyber-matrix') {
        ctx.font = '11px monospace';
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vy) p.y += p.vy * dt;
          ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.9})`;
          ctx.fillText(p.char || '0', p.x, p.y);
        }
      } else if (trailMode === 'fluid-smoke') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          p.size += 22 * dt;
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;

          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, `rgba(${r},${g},${b},${p.life * 0.3})`);
          grad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      } else if (trailMode === 'fire-flame') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;

          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life);
          grad.addColorStop(0, `rgba(255, 240, 150, ${p.life * 0.9})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${b}, ${p.life * 0.7})`);
          grad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      } else if (trailMode === 'lightning-tendrils') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }

          // Jagged 4-step midpoint displacement
          const x1 = mouse.smoothX || mouse.x;
          const y1 = mouse.smoothY || mouse.y;
          const x2 = p.x;
          const y2 = p.y;
          const segs = 4;
          const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
          for (let s = 1; s < segs; s++) {
            const ratio = s / segs;
            const jx = (Math.random() - 0.5) * 16;
            const jy = (Math.random() - 0.5) * 16;
            pts.push({
              x: x1 + (x2 - x1) * ratio + jx,
              y: y1 + (y2 - y1) * ratio + jy,
            });
          }
          pts.push({ x: x2, y: y2 });

          // Pass 1: Saturated glow halo
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let s = 1; s < pts.length; s++) {
            ctx.lineTo(pts[s].x, pts[s].y);
          }
          ctx.strokeStyle = `rgba(${r},${g},${b},${p.life * 0.75})`;
          ctx.lineWidth = 3.5;
          ctx.stroke();

          // Pass 2: White hot core
          ctx.strokeStyle = `rgba(255, 255, 255, ${p.life * 0.95})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      } else if (trailMode === 'crystal-prism') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;
          if (p.rot !== undefined && p.rotSpeed !== undefined) p.rot += p.rotSpeed * dt;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          ctx.beginPath();
          ctx.moveTo(0, -p.size * p.life);
          ctx.lineTo(p.size * 0.7 * p.life, 0);
          ctx.lineTo(0, p.size * p.life);
          ctx.lineTo(-p.size * 0.7 * p.life, 0);
          ctx.closePath();
          ctx.strokeStyle = `rgba(${r},${g},${b},${p.life * 0.8})`;
          ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.15})`;
          ctx.lineWidth = 1.2;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      } else if (trailMode === 'bubble-float') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${p.life * 0.7})`;
          ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.08})`;
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();

          // Bubble shine dot
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.75})`;
          ctx.fill();
        }
      } else if (trailMode === 'hyper-warp') {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            trail.splice(i, 1);
            continue;
          }
          if (p.vx) p.x += p.vx * dt;
          if (p.vy) p.y += p.vy * dt;

          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(p.angle || 0) * p.size, p.y + Math.sin(p.angle || 0) * p.size);
          ctx.strokeStyle = `rgba(${r},${g},${b},${p.life * 0.8})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (trailMode === 'gravity-field' && mouse.isHovering) {
        const time = now * 0.003;
        for (let i = 0; i < 3; i++) {
          const angle = time + (i * Math.PI * 2) / 3;
          const dist = 24 + Math.sin(time * 2 + i) * 6;
          const px = mouse.x + Math.cos(angle) * dist;
          const py = mouse.y + Math.sin(angle) * dist;

          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
          ctx.shadowColor = `rgba(${r},${g},${b},1)`;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // -------------------------------------------------------------
      // 3. RENDER CLICK PARTICLES & CONFETTI
      // -------------------------------------------------------------
      for (let i = clickParticles.length - 1; i >= 0; i--) {
        const cp = clickParticles[i];
        cp.life -= dt / cp.maxLife;
        if (cp.life <= 0) {
          clickParticles.splice(i, 1);
          continue;
        }
        cp.x += cp.vx * dt;
        cp.y += cp.vy * dt;
        cp.vy += (cp.type === 'rect' ? 180 : 260) * dt; // gravity

        if (cp.rot !== undefined && cp.rotSpeed !== undefined) {
          cp.rot += cp.rotSpeed * dt;
        }

        if (cp.type === 'rect' && cp.w && cp.h) {
          ctx.save();
          ctx.translate(cp.x, cp.y);
          ctx.rotate(cp.rot || 0);
          ctx.fillStyle = cp.color;
          ctx.fillRect(-cp.w / 2, -cp.h / 2, cp.w, cp.h);
          ctx.restore();
        } else if (cp.type === 'shard') {
          ctx.save();
          ctx.translate(cp.x, cp.y);
          ctx.rotate(cp.rot || 0);
          ctx.beginPath();
          ctx.moveTo(0, -cp.size * cp.life);
          ctx.lineTo(cp.size * 0.8 * cp.life, cp.size * 0.6 * cp.life);
          ctx.lineTo(-cp.size * 0.8 * cp.life, cp.size * 0.6 * cp.life);
          ctx.closePath();
          ctx.fillStyle = cp.color;
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(cp.x, cp.y, cp.size * cp.life, 0, Math.PI * 2);
          ctx.fillStyle = cp.color;
          ctx.fill();
        }
      }

      // -------------------------------------------------------------
      // 4. RENDER CLICK SHOCKWAVES & MAGNETIC PULSES
      // -------------------------------------------------------------
      for (let i = clickWaves.length - 1; i >= 0; i--) {
        const w = clickWaves[i];
        if (w.kind === 'implosion') {
          w.radius -= 180 * dt;
          if (w.radius <= 0) {
            clickWaves.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${w.opacity * 0.8})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (w.kind === 'magnetic') {
          w.radius += 180 * dt;
          w.opacity = Math.max(0, 1 - w.radius / w.maxRadius);
          if (w.radius >= w.maxRadius || w.opacity <= 0) {
            clickWaves.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.ellipse(w.x, w.y, w.radius, w.radius * 0.5, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${w.opacity * 0.7})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          w.radius += 250 * dt;
          w.opacity = Math.max(0, 1 - w.radius / w.maxRadius);
          if (w.radius >= w.maxRadius || w.opacity <= 0) {
            clickWaves.splice(i, 1);
            continue;
          }

          if (w.arcs) {
            // Pass 1: Saturated electric neon halo
            ctx.beginPath();
            for (const arc of w.arcs) {
              const jx = (Math.random() - 0.5) * 2;
              const jy = (Math.random() - 0.5) * 2;
              ctx.moveTo(arc.x1 + jx, arc.y1 + jy);
              ctx.lineTo(arc.x2 + jx, arc.y2 + jy);
            }
            ctx.strokeStyle = `rgba(${r},${g},${b},${w.opacity * 0.85})`;
            ctx.lineWidth = 4;
            ctx.stroke();

            // Pass 2: Bright white core filament
            ctx.beginPath();
            for (const arc of w.arcs) {
              ctx.moveTo(arc.x1, arc.y1);
              ctx.lineTo(arc.x2, arc.y2);
            }
            ctx.strokeStyle = `rgba(255, 255, 255, ${w.opacity})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r},${g},${b},${w.opacity * 0.8})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    setup();
    window.addEventListener('resize', setup);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true });

    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', setup);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [trailMode, clickEffect, haloMode, clickSound, soundVolume, trailLength, rippleIntensity, accent, enabled]);

  return (
    <canvas
      ref={canvasRef}
      id="cursor-trail-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}
