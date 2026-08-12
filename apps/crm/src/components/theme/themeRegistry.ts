/**
 * Hyper-Custom Theme & Animation Engine — theme registry.
 *
 * Adding a new theme = one entry here + its visuals:
 *  - engine: 'css'    → add `.theme-<id>-l<n>` layer classes / keyframes in theme-engine.css
 *                       and set `cssLayers` to the number of layer divs to render.
 *  - engine: 'canvas' → add a renderer in canvasRenderers.ts keyed by `canvas`.
 *  - engine: 'legacy' → rendered by the pre-engine rules in globals.css (data-mode selectors).
 *  - engine: 'none'   → no background animation at all ("Off").
 */

export type AccentColor = 'orange' | 'cyan' | 'purple' | 'emerald' | 'rose' | 'amber';
export type EngineIntensity = 'subtle' | 'normal' | 'vivid';

export type CanvasKind =
  | 'starfield'
  | 'particle-nexus'
  | 'code-rain'
  | 'firefly-swarm'
  | 'meteor-shower'
  | 'circuit-flow'
  | 'rain-glass';

export interface ThemeDefinition {
  id: string;
  name: string;
  /** Short badge shown on the theme card. */
  tag: string;
  description: string;
  engine: 'legacy' | 'css' | 'canvas' | 'none';
  /** Number of CSS layer divs (`theme-<id>-l1..n`) — css engine only. */
  cssLayers?: number;
  /** Renderer key — canvas engine only. */
  canvas?: CanvasKind;
  /** Accent that pairs with this theme when "Sync accent" is enabled. */
  accent: AccentColor;
  /** Opaque base color painted behind every animated layer. */
  baseColor: string;
  /** Static gradient used for prefers-reduced-motion fallback + card backdrop. */
  staticBackground: string;
}

export const ACCENT_RGB: Record<AccentColor, [number, number, number]> = {
  orange: [255, 122, 69],
  cyan: [6, 182, 212],
  purple: [168, 85, 247],
  emerald: [16, 185, 129],
  rose: [244, 63, 94],
  amber: [245, 158, 11],
};

export const THEMES = [
  {
    id: 'professional-matte',
    name: 'Off — Professional Matte',
    tag: '0% GPU Load',
    description: 'Sleek high-contrast matte canvas with zero background animation for maximum speed & focus.',
    engine: 'none',
    accent: 'orange',
    baseColor: '#080A12',
    staticBackground: 'linear-gradient(180deg, #0B0E18 0%, #06070D 100%)',
  },
  {
    id: 'cosmic-stars',
    name: 'Cosmic Starry Night',
    tag: 'Classic',
    description: 'The original multi-layered starry night with floating meteor shooting stars.',
    engine: 'legacy',
    accent: 'orange',
    baseColor: '#080a12',
    staticBackground:
      'radial-gradient(ellipse at 20% 10%, rgba(255,94,0,0.25), transparent 70%), radial-gradient(ellipse at 80% 85%, rgba(255,122,69,0.2), transparent 70%), #080a12',
  },
  {
    id: 'liquid-aurora',
    name: 'Liquid Aurora Wave Mesh',
    tag: 'Classic',
    description: 'The original organic flowing liquid gradient waves & ambient light mesh.',
    engine: 'legacy',
    accent: 'purple',
    baseColor: '#050c18',
    staticBackground:
      'radial-gradient(ellipse at 10% 20%, rgba(139,127,217,0.32), transparent 70%), radial-gradient(ellipse at 90% 80%, rgba(79,232,206,0.28), transparent 70%), #050c18',
  },
  {
    id: 'cyberpunk-grid',
    name: 'Cyberpunk Digital Grid',
    tag: 'Classic',
    description: 'The original pulsing neon digital grid floor with data vector glow.',
    engine: 'legacy',
    accent: 'cyan',
    baseColor: '#040a12',
    staticBackground:
      'radial-gradient(ellipse at 50% 30%, rgba(34,211,238,0.25), transparent 70%), #040a12',
  },
  // ——— NEW ENGINE THEMES ———
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    tag: 'Polar Ribbons',
    description: 'Drifting blurred aurora ribbons of teal, violet & green swaying across a polar night sky.',
    engine: 'css',
    cssLayers: 4,
    accent: 'emerald',
    baseColor: '#030B12',
    staticBackground:
      'linear-gradient(160deg, rgba(45,212,191,0.22) 0%, transparent 45%), linear-gradient(20deg, rgba(129,140,248,0.18) 10%, transparent 55%), #030B12',
  },
  {
    id: 'starfield',
    name: 'Starfield Parallax',
    tag: 'Deep Space Drift',
    description: 'Three depth layers of twinkling stars drifting at different parallax speeds through deep space.',
    engine: 'canvas',
    canvas: 'starfield',
    accent: 'amber',
    baseColor: '#05060E',
    staticBackground:
      'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.9), transparent), radial-gradient(1.5px 1.5px at 70% 60%, rgba(255,220,180,0.8), transparent), radial-gradient(1px 1px at 45% 80%, rgba(255,255,255,0.7), transparent), #05060E',
  },
  {
    id: 'particle-nexus',
    name: 'Particle Nexus',
    tag: 'Neural Web',
    description: 'A floating particle field that weaves glowing connection lines between nearby nodes.',
    engine: 'canvas',
    canvas: 'particle-nexus',
    accent: 'cyan',
    baseColor: '#04080F',
    staticBackground:
      'radial-gradient(ellipse at 30% 40%, rgba(6,182,212,0.14), transparent 60%), radial-gradient(ellipse at 75% 70%, rgba(6,182,212,0.10), transparent 60%), #04080F',
  },
  {
    id: 'code-rain',
    name: 'Code Rain',
    tag: 'Matrix Cascade',
    description: 'Subtle brand-tinted glyph rain cascading down the screen, matrix style.',
    engine: 'canvas',
    canvas: 'code-rain',
    accent: 'emerald',
    baseColor: '#030905',
    staticBackground:
      'linear-gradient(180deg, rgba(16,185,129,0.10) 0%, transparent 60%), #030905',
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    tag: 'Caustic Waves',
    description: 'Rippling underwater caustic light dapples with soft god-rays sweeping from the surface.',
    engine: 'css',
    cssLayers: 4,
    accent: 'cyan',
    baseColor: '#02101C',
    staticBackground:
      'linear-gradient(180deg, rgba(56,189,248,0.16) 0%, transparent 55%), radial-gradient(ellipse at 50% 110%, rgba(2,44,74,0.9), transparent 70%), #02101C',
  },
  {
    id: 'firefly-swarm',
    name: 'Firefly Swarm',
    tag: 'Organic Glow',
    description: 'Warm glowing orbs drifting with organic easing through a dark summer meadow.',
    engine: 'canvas',
    canvas: 'firefly-swarm',
    accent: 'amber',
    baseColor: '#070904',
    staticBackground:
      'radial-gradient(circle at 25% 60%, rgba(245,158,11,0.16), transparent 30%), radial-gradient(circle at 70% 35%, rgba(190,242,100,0.10), transparent 25%), #070904',
  },
  {
    id: 'mesh-morph',
    name: 'Gradient Mesh Morph',
    tag: 'Liquid Blobs',
    description: 'Huge soft-focus gradient blobs slowly morphing and gliding around one another.',
    engine: 'css',
    cssLayers: 4,
    accent: 'purple',
    baseColor: '#070313',
    staticBackground:
      'radial-gradient(circle at 25% 30%, rgba(168,85,247,0.24), transparent 55%), radial-gradient(circle at 75% 70%, rgba(79,232,206,0.18), transparent 55%), #070313',
  },
  {
    id: 'grid-pulse',
    name: 'Grid Pulse',
    tag: 'Synthwave Floor',
    description: 'A perspective horizon grid with traveling light pulses racing toward the vanishing point.',
    engine: 'css',
    cssLayers: 3,
    accent: 'orange',
    baseColor: '#0A0510',
    staticBackground:
      'linear-gradient(180deg, transparent 40%, rgba(255,122,69,0.14) 100%), radial-gradient(ellipse at 50% 45%, rgba(255,122,69,0.16), transparent 55%), #0A0510',
  },
  {
    id: 'meteor-shower',
    name: 'Meteor Shower',
    tag: 'Streaking Tails',
    description: 'Diagonal meteor streaks with luminous tails raining across a still starfield.',
    engine: 'canvas',
    canvas: 'meteor-shower',
    accent: 'orange',
    baseColor: '#070409',
    staticBackground:
      'linear-gradient(215deg, rgba(255,122,69,0.14) 0%, transparent 35%), radial-gradient(1px 1px at 60% 30%, rgba(255,255,255,0.8), transparent), #070409',
  },
  {
    id: 'nebula-smoke',
    name: 'Nebula Smoke',
    tag: 'Cosmic Clouds',
    description: 'Layered nebula clouds of violet, indigo & rose slowly churning behind faint stars.',
    engine: 'css',
    cssLayers: 4,
    accent: 'rose',
    baseColor: '#060310',
    staticBackground:
      'radial-gradient(ellipse at 30% 35%, rgba(139,92,246,0.22), transparent 55%), radial-gradient(ellipse at 70% 65%, rgba(244,63,94,0.14), transparent 55%), #060310',
  },
  {
    id: 'circuit-flow',
    name: 'Circuit Flow',
    tag: 'Living PCB',
    description: 'Circuit-board traces lighting up as energy pulses travel between glowing solder nodes.',
    engine: 'canvas',
    canvas: 'circuit-flow',
    accent: 'cyan',
    baseColor: '#040A0D',
    staticBackground:
      'linear-gradient(90deg, rgba(6,182,212,0.06) 1px, transparent 1px), linear-gradient(rgba(6,182,212,0.06) 1px, transparent 1px), #040A0D',
  },
  {
    id: 'rain-glass',
    name: 'Rain on Glass',
    tag: 'Night Drizzle',
    description: 'Raindrops streaking and beading down a window pane over a blurred city night.',
    engine: 'canvas',
    canvas: 'rain-glass',
    accent: 'cyan',
    baseColor: '#05080D',
    staticBackground:
      'radial-gradient(ellipse at 20% 80%, rgba(56,189,248,0.10), transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(148,163,184,0.08), transparent 50%), #05080D',
  },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_IDS = THEMES.map((t) => t.id) as ThemeId[];

/** Themes that actually animate — used by the "Random theme" action. */
export const ANIMATED_THEME_IDS = THEMES.filter(
  (t) => t.engine === 'css' || t.engine === 'canvas'
).map((t) => t.id) as ThemeId[];

export function getTheme(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function isThemeId(id: string | null | undefined): id is ThemeId {
  return !!id && THEMES.some((t) => t.id === id);
}

export function randomThemeId(exclude?: string): ThemeId {
  const pool = ANIMATED_THEME_IDS.filter((id) => id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

export const INTENSITY_FACTOR: Record<EngineIntensity, number> = {
  subtle: 0.6,
  normal: 1,
  vivid: 1.45,
};

export function isIntensity(v: string | null | undefined): v is EngineIntensity {
  return v === 'subtle' || v === 'normal' || v === 'vivid';
}

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
}
