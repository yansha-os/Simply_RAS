/**
 * Hyper-Custom Theme & Animation Engine 2.0 (Enterprise Edition)
 * 32+ Unique Themes · Interactive Cursor Trails · Click Shockwave Physics · Light & Dark Color Modes
 */

export type AccentColor =
  | 'orange'
  | 'cyan'
  | 'purple'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'indigo'
  | 'teal'
  | 'crimson'
  | 'lime'
  | 'magenta'
  | 'gold'
  | 'violet'
  | 'aqua'
  | 'pink'
  | 'coral'
  | 'ice'
  | 'custom';

export type EngineIntensity = 'subtle' | 'normal' | 'vivid' | 'ultra';

export type CursorTrailMode =
  | 'none'
  | 'stardust'
  | 'neon-plasma'
  | 'cyber-matrix'
  | 'fluid-smoke'
  | 'gravity-field'
  | 'rainbow-sparkler'
  | 'fire-flame'
  | 'lightning-tendrils'
  | 'crystal-prism'
  | 'bubble-float'
  | 'hyper-warp';

export type ClickEffectMode =
  | 'none'
  | 'shockwave-ring'
  | 'particle-burst'
  | 'ripple-distortion'
  | 'electric-arc'
  | 'supernova-implosion'
  | 'confetti-blast'
  | 'quantum-shatter'
  | 'magnetic-pulse';

export type CursorHaloMode =
  | 'none'
  | 'halo-glow'
  | 'tech-crosshair'
  | 'magnetic-dot'
  | 'cyber-pulse';

export type ClickSoundMode =
  | 'none'
  | 'subtle-click'
  | 'sci-fi-blip'
  | 'bubble-pop'
  | 'quantum-pulse';

export type ThemeCategory =
  | 'all'
  | 'cosmos'
  | 'cyber'
  | 'organic'
  | 'fractal'
  | 'minimal';

export type CanvasKind =
  | 'starfield'
  | 'particle-nexus'
  | 'code-rain'
  | 'firefly-swarm'
  | 'meteor-shower'
  | 'circuit-flow'
  | 'rain-glass'
  | 'quantum-flux'
  | 'cyber-hologram'
  | 'solar-flare'
  | 'bioluminescent-abyss'
  | 'warp-drive'
  | 'matrix-glitch'
  | 'fractal-mandala'
  | 'supernova-burst'
  | 'crystal-cavern'
  | 'synthwave-highway'
  | 'black-hole-singularity'
  | 'electric-storm'
  | 'sakura-fall'
  | 'cosmic-stars'
  | 'nebula-smoke'
  | 'cyberpunk-grid'
  | 'grid-pulse'
  | 'liquid-aurora'
  | 'aurora-borealis'
  | 'deep-ocean'
  | 'mesh-morph';

export interface ThemeDefinition {
  id: string;
  name: string;
  category: ThemeCategory;
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
  /** Opaque base color painted behind every animated layer in dark mode. */
  baseColor: string;
  /** Light mode base color. */
  lightBaseColor?: string;
  /** Static gradient used for prefers-reduced-motion fallback + card backdrop. */
  staticBackground: string;
  /** Light mode static gradient fallback. */
  lightStaticBackground?: string;
}

export const ACCENT_RGB: Record<AccentColor, [number, number, number]> = {
  orange: [255, 122, 69],
  cyan: [6, 182, 212],
  purple: [168, 85, 247],
  emerald: [16, 185, 129],
  rose: [244, 63, 94],
  amber: [245, 158, 11],
  indigo: [99, 102, 241],
  teal: [20, 184, 166],
  crimson: [225, 29, 72],
  lime: [132, 204, 22],
  magenta: [217, 70, 239],
  gold: [234, 179, 8],
  violet: [124, 58, 237],
  aqua: [14, 165, 233],
  pink: [244, 114, 182],
  coral: [251, 146, 60],
  ice: [56, 189, 248],
  custom: [255, 122, 69],
};

export const THEMES = [
  // ——— MINIMAL & MATTE ———
  {
    id: 'professional-matte',
    name: 'Off — Professional Matte',
    category: 'minimal',
    tag: '0% GPU Load',
    description: 'Sleek high-contrast matte canvas with zero background animation for maximum speed & focus.',
    engine: 'none',
    accent: 'orange',
    baseColor: '#080A12',
    lightBaseColor: '#F8FAFC',
    staticBackground: 'linear-gradient(180deg, #0B0E18 0%, #06070D 100%)',
    lightStaticBackground: 'linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%)',
  },
  {
    id: 'obsidian-stealth',
    name: 'Obsidian Stealth',
    category: 'minimal',
    tag: 'OLED Pure Black',
    description: 'Ultra-deep zero-backlight canvas optimized for high-contrast typography and battery longevity.',
    engine: 'none',
    accent: 'emerald',
    baseColor: '#020203',
    lightBaseColor: '#F4F4F5',
    staticBackground: '#020203',
    lightStaticBackground: '#F4F4F5',
  },

  // ——— COSMOS & DEEP SPACE ———
  {
    id: 'cosmic-stars',
    name: 'Cosmic Galaxy Vortex',
    category: 'cosmos',
    tag: 'Spiral Galaxy',
    description: '3D rotating spiral galaxy with interstellar dust filaments, orbiting star clusters, and gravitational cursor warping.',
    engine: 'canvas',
    canvas: 'cosmic-stars',
    accent: 'orange',
    baseColor: '#080a12',
    lightBaseColor: '#F0F4F8',
    staticBackground:
      'radial-gradient(ellipse at 20% 10%, rgba(255,94,0,0.25), transparent 70%), radial-gradient(ellipse at 80% 85%, rgba(255,122,69,0.2), transparent 70%), #080a12',
  },
  {
    id: 'starfield',
    name: 'Starfield Parallax',
    category: 'cosmos',
    tag: 'Deep Space Drift',
    description: 'Three depth layers of twinkling stars drifting at different parallax speeds through celestial nebula dust.',
    engine: 'canvas',
    canvas: 'starfield',
    accent: 'amber',
    baseColor: '#05060E',
    lightBaseColor: '#F1F5F9',
    staticBackground:
      'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.9), transparent), radial-gradient(1.5px 1.5px at 70% 60%, rgba(255,220,180,0.8), transparent), radial-gradient(1px 1px at 45% 80%, rgba(255,255,255,0.7), transparent), #05060E',
  },
  {
    id: 'meteor-shower',
    name: 'Meteor Shower Storm',
    category: 'cosmos',
    tag: 'Incandescent Tails',
    description: 'Diagonal luminous meteor streaks with burning cores and atmospheric friction sparks across space.',
    engine: 'canvas',
    canvas: 'meteor-shower',
    accent: 'orange',
    baseColor: '#070409',
    lightBaseColor: '#F8FAFC',
    staticBackground:
      'linear-gradient(215deg, rgba(255,122,69,0.14) 0%, transparent 35%), radial-gradient(1px 1px at 60% 30%, rgba(255,255,255,0.8), transparent), #070409',
  },
  {
    id: 'nebula-smoke',
    name: 'Cosmic Nebula Nursery',
    category: 'cosmos',
    tag: 'Volumetric Clouds',
    description: 'Volumetric multi-spectral cosmic nebula with churning gas filaments, stellar nursery glow, and cosmic wind.',
    engine: 'canvas',
    canvas: 'nebula-smoke',
    accent: 'rose',
    baseColor: '#060310',
    lightBaseColor: '#FAF5FF',
    staticBackground:
      'radial-gradient(ellipse at 30% 35%, rgba(139,92,246,0.22), transparent 55%), radial-gradient(ellipse at 70% 65%, rgba(244,63,94,0.14), transparent 55%), #060310',
  },
  {
    id: 'warp-drive',
    name: 'Warp Drive Relativistic',
    category: 'cosmos',
    tag: 'Hyperspace Tunnel',
    description: 'Radial star acceleration streaking from a central vanishing point with relativistic color shift and tunnel roll.',
    engine: 'canvas',
    canvas: 'warp-drive',
    accent: 'cyan',
    baseColor: '#03040B',
    lightBaseColor: '#F0FDF4',
    staticBackground:
      'radial-gradient(circle at 50% 50%, rgba(6,182,212,0.25) 0%, transparent 70%), #03040B',
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare Plasma',
    category: 'cosmos',
    tag: 'Coronal Loops',
    description: 'Molten plasma vortex with twisting coronal magnetic loops, prominence arcs, and turbulent ejection trails.',
    engine: 'canvas',
    canvas: 'solar-flare',
    accent: 'orange',
    baseColor: '#0A0402',
    lightBaseColor: '#FFF7ED',
    staticBackground:
      'radial-gradient(circle at 50% 50%, rgba(255,122,69,0.28) 0%, transparent 65%), #0A0402',
  },
  {
    id: 'supernova-burst',
    name: 'Supernova Cosmic Burst',
    category: 'cosmos',
    tag: 'Pulsar Shockwave',
    description: 'Expanding relativistic shockwave front with sweeping pulsar jet beams and turbulent stellar debris filaments.',
    engine: 'canvas',
    canvas: 'supernova-burst',
    accent: 'coral',
    baseColor: '#0A0308',
    lightBaseColor: '#FFF1F2',
    staticBackground:
      'radial-gradient(circle at 50% 50%, rgba(251,146,60,0.30) 0%, rgba(244,63,94,0.15) 45%, transparent 70%), #0A0308',
  },
  {
    id: 'black-hole-singularity',
    name: 'Black Hole Singularity',
    category: 'cosmos',
    tag: 'Gravitational Lens',
    description: 'Relativistic Kerr black hole with Doppler-beamed accretion disk, Einstein photon ring, and cursor gravity.',
    engine: 'canvas',
    canvas: 'black-hole-singularity',
    accent: 'amber',
    baseColor: '#040306',
    lightBaseColor: '#FEFCE8',
    staticBackground:
      'radial-gradient(circle at 50% 50%, #000000 20%, rgba(245,158,11,0.25) 40%, transparent 70%), #040306',
  },

  // ——— CYBER & TECH ———
  {
    id: 'cyberpunk-grid',
    name: 'Cyberpunk Neon Terrain',
    category: 'cyber',
    tag: 'Wave Terrain',
    description: '3D perspective neon synthwave terrain undulating with audio-spectrum harmonics and cursor ripple waves.',
    engine: 'canvas',
    canvas: 'cyberpunk-grid',
    accent: 'cyan',
    baseColor: '#040a12',
    lightBaseColor: '#ECFEFF',
    staticBackground:
      'radial-gradient(ellipse at 50% 30%, rgba(34,211,238,0.25), transparent 70%), #040a12',
  },
  {
    id: 'particle-nexus',
    name: 'Particle Nexus',
    category: 'cyber',
    tag: 'Neural Synapses',
    description: 'Floating synaptic network weaving glowing batched connection lines with traveling action-potential pulses.',
    engine: 'canvas',
    canvas: 'particle-nexus',
    accent: 'cyan',
    baseColor: '#04080F',
    lightBaseColor: '#F0F9FF',
    staticBackground:
      'radial-gradient(ellipse at 30% 40%, rgba(6,182,212,0.14), transparent 60%), radial-gradient(ellipse at 75% 70%, rgba(6,182,212,0.10), transparent 60%), #04080F',
  },
  {
    id: 'code-rain',
    name: 'Code Rain Phosphor',
    category: 'cyber',
    tag: 'Matrix Stream',
    description: 'High-density cyber glyph stream cascading with glowing phosphor heads and hexadecimal decode flashes.',
    engine: 'canvas',
    canvas: 'code-rain',
    accent: 'emerald',
    baseColor: '#030905',
    lightBaseColor: '#F0FDF4',
    staticBackground:
      'linear-gradient(180deg, rgba(16,185,129,0.10) 0%, transparent 60%), #030905',
  },
  {
    id: 'matrix-glitch',
    name: 'Matrix Cyber Glitch',
    category: 'cyber',
    tag: 'Binary Slice',
    description: 'High-speed binary stream cascade with horizontal glitch displacement slices and EMP shockwaves.',
    engine: 'canvas',
    canvas: 'matrix-glitch',
    accent: 'lime',
    baseColor: '#020A04',
    lightBaseColor: '#F7FEE7',
    staticBackground:
      'linear-gradient(180deg, rgba(132,204,22,0.15) 0%, transparent 65%), #020A04',
  },
  {
    id: 'circuit-flow',
    name: 'Circuit Flow Living PCB',
    category: 'cyber',
    tag: 'Logic Traces',
    description: 'Circuit-board microchip traces lighting up as glowing binary data packets route across solder nodes.',
    engine: 'canvas',
    canvas: 'circuit-flow',
    accent: 'cyan',
    baseColor: '#040A0D',
    lightBaseColor: '#F0FDFA',
    staticBackground:
      'linear-gradient(90deg, rgba(6,182,212,0.06) 1px, transparent 1px), linear-gradient(rgba(6,182,212,0.06) 1px, transparent 1px), #040A0D',
  },
  {
    id: 'quantum-flux',
    name: 'Quantum Flux Mechanics',
    category: 'cyber',
    tag: 'Schrödinger Waves',
    description: 'Harmonic quantum probability standing waves with orbital nodes and interactive wave-packet collapse.',
    engine: 'canvas',
    canvas: 'quantum-flux',
    accent: 'purple',
    baseColor: '#060412',
    lightBaseColor: '#FAF5FF',
    staticBackground:
      'radial-gradient(ellipse at 40% 60%, rgba(168,85,247,0.22), transparent 60%), #060412',
  },
  {
    id: 'cyber-hologram',
    name: 'Cyber Hologram Wireframe',
    category: 'cyber',
    tag: '3D Polytope',
    description: 'Rotating 3D perspective wireframe terrain with holographic scanlines and spectrum undulations.',
    engine: 'canvas',
    canvas: 'cyber-hologram',
    accent: 'teal',
    baseColor: '#020B0E',
    lightBaseColor: '#F0FDFA',
    staticBackground:
      'radial-gradient(ellipse at 50% 80%, rgba(20,184,166,0.20), transparent 65%), #020B0E',
  },
  {
    id: 'synthwave-highway',
    name: 'Synthwave 80s Highway',
    category: 'cyber',
    tag: 'Neon Grid Sun',
    description: 'Infinite Outrun neon grid highway speeding towards wireframe mountains and a retro glowing sun.',
    engine: 'canvas',
    canvas: 'synthwave-highway',
    accent: 'magenta',
    baseColor: '#0A0312',
    lightBaseColor: '#FDF4FF',
    staticBackground:
      'linear-gradient(180deg, rgba(217,70,239,0.18) 0%, rgba(249,115,22,0.20) 60%, transparent 100%), #0A0312',
  },
  {
    id: 'grid-pulse',
    name: 'Grid Pulse Hyper-Highway',
    category: 'cyber',
    tag: 'Laser Beams',
    description: '3D perspective laser horizon grid with traveling hyper-pulse waves and cursor height-map spikes.',
    engine: 'canvas',
    canvas: 'grid-pulse',
    accent: 'orange',
    baseColor: '#0A0510',
    lightBaseColor: '#FFF7ED',
    staticBackground:
      'linear-gradient(180deg, transparent 40%, rgba(255,122,69,0.14) 100%), radial-gradient(ellipse at 50% 45%, rgba(255,122,69,0.16), transparent 55%), #0A0510',
  },

  // ——— ORGANIC & NATURE ———
  {
    id: 'liquid-aurora',
    name: 'Liquid Aurora Plasma',
    category: 'organic',
    tag: 'Magnetic Ribbons',
    description: 'Interactive magnetic plasma ribbons with multi-frequency waving folds and fluid cursor displacement.',
    engine: 'canvas',
    canvas: 'liquid-aurora',
    accent: 'purple',
    baseColor: '#050c18',
    lightBaseColor: '#F8FAFC',
    staticBackground:
      'radial-gradient(ellipse at 10% 20%, rgba(139,127,217,0.32), transparent 70%), radial-gradient(ellipse at 90% 80%, rgba(79,232,206,0.28), transparent 70%), #050c18',
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis Curtains',
    category: 'organic',
    tag: 'Polar Drapery',
    description: 'Volumetric geomagnetic curtains with shimmering vertical ray folds and shifting emerald/violet hues.',
    engine: 'canvas',
    canvas: 'aurora-borealis',
    accent: 'emerald',
    baseColor: '#030B12',
    lightBaseColor: '#ECFDF5',
    staticBackground:
      'linear-gradient(160deg, rgba(45,212,191,0.22) 0%, transparent 45%), linear-gradient(20deg, rgba(129,140,248,0.18) 10%, transparent 55%), #030B12',
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean Caustics',
    category: 'organic',
    tag: 'Sun God-Rays',
    description: 'Underwater caustic light dapples with sweeping volumetric god-rays and interactive water ripple waves.',
    engine: 'canvas',
    canvas: 'deep-ocean',
    accent: 'cyan',
    baseColor: '#02101C',
    lightBaseColor: '#F0F9FF',
    staticBackground:
      'linear-gradient(180deg, rgba(56,189,248,0.16) 0%, transparent 55%), radial-gradient(ellipse at 50% 110%, rgba(2,44,74,0.9), transparent 70%), #02101C',
  },
  {
    id: 'firefly-swarm',
    name: 'Firefly Swarm Boids',
    category: 'organic',
    tag: 'Flocking Light',
    description: 'Warm glowing orbs flocking with organic Boids aerodynamics and curiosity attraction towards the cursor.',
    engine: 'canvas',
    canvas: 'firefly-swarm',
    accent: 'amber',
    baseColor: '#070904',
    lightBaseColor: '#FEFCE8',
    staticBackground:
      'radial-gradient(circle at 25% 60%, rgba(245,158,11,0.16), transparent 30%), radial-gradient(circle at 70% 35%, rgba(190,242,100,0.10), transparent 25%), #070904',
  },
  {
    id: 'mesh-morph',
    name: 'Fluid Metaballs Morph',
    category: 'organic',
    tag: 'Liquid Physics',
    description: 'Liquid fluid metaballs with dynamic surface tension merging, chromatic refraction, and fluid push physics.',
    engine: 'canvas',
    canvas: 'mesh-morph',
    accent: 'purple',
    baseColor: '#070313',
    lightBaseColor: '#FAF5FF',
    staticBackground:
      'radial-gradient(circle at 25% 30%, rgba(168,85,247,0.24), transparent 55%), radial-gradient(circle at 75% 70%, rgba(79,232,206,0.18), transparent 55%), #070313',
  },
  {
    id: 'rain-glass',
    name: 'Rain on Glass Drizzle',
    category: 'organic',
    tag: 'Night Condensation',
    description: 'Raindrops streaking and beading down a wet window pane with colliding droplets and lightning flashes.',
    engine: 'canvas',
    canvas: 'rain-glass',
    accent: 'cyan',
    baseColor: '#05080D',
    lightBaseColor: '#F8FAFC',
    staticBackground:
      'radial-gradient(ellipse at 20% 80%, rgba(56,189,248,0.10), transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(148,163,184,0.08), transparent 50%), #05080D',
  },
  {
    id: 'bioluminescent-abyss',
    name: 'Bioluminescent Jellyfish Abyss',
    category: 'organic',
    tag: 'Deep Jellyfish',
    description: 'Translucent deep-sea jellyfish with pulsating bell contractions, glowing tentacles, and bio-luminescent spores.',
    engine: 'canvas',
    canvas: 'bioluminescent-abyss',
    accent: 'teal',
    baseColor: '#01090C',
    lightBaseColor: '#F0FDFA',
    staticBackground:
      'radial-gradient(ellipse at 40% 70%, rgba(20,184,166,0.18), transparent 60%), #01090C',
  },
  {
    id: 'sakura-fall',
    name: 'Sakura Petal Drift',
    category: 'organic',
    tag: '3D Aerodynamics',
    description: 'Delicate cherry blossom petals tumbling with 3D aerodynamic flutter, spin, and cursor wind gusts.',
    engine: 'canvas',
    canvas: 'sakura-fall',
    accent: 'pink',
    baseColor: '#0B0408',
    lightBaseColor: '#FFF1F2',
    staticBackground:
      'radial-gradient(ellipse at 30% 20%, rgba(244,114,182,0.20), transparent 60%), #0B0408',
  },
  {
    id: 'electric-storm',
    name: 'Electric Plasma Storm',
    category: 'organic',
    tag: 'Fractal Lightning',
    description: 'Photorealistic fractal lightning strikes with atmospheric sky flashes, ionization strobe, and Tesla coil attraction.',
    engine: 'canvas',
    canvas: 'electric-storm',
    accent: 'ice',
    baseColor: '#04060E',
    lightBaseColor: '#F0F9FF',
    staticBackground:
      'radial-gradient(ellipse at 50% 30%, rgba(56,189,248,0.22), transparent 65%), #04060E',
  },

  // ——— FRACTAL & GEOMETRY ———
  {
    id: 'fractal-mandala',
    name: 'Fractal Sacred Mandala',
    category: 'fractal',
    tag: 'Flower of Life',
    description: 'Sacred geometry Flower of Life mandala rotating and morphing with kaleidoscopic trigonometric ratios.',
    engine: 'canvas',
    canvas: 'fractal-mandala',
    accent: 'violet',
    baseColor: '#080312',
    lightBaseColor: '#FAF5FF',
    staticBackground:
      'radial-gradient(circle at 50% 50%, rgba(124,58,237,0.25) 0%, transparent 65%), #080312',
  },
  {
    id: 'crystal-cavern',
    name: 'Crystal Cavern Caustics',
    category: 'fractal',
    tag: 'Prismatic Refraction',
    description: '3D faceted quartz crystal prisms refracting spectral rainbow flares, internal caustics, and cursor laser beams.',
    engine: 'canvas',
    canvas: 'crystal-cavern',
    accent: 'aqua',
    baseColor: '#020910',
    lightBaseColor: '#F0F9FF',
    staticBackground:
      'radial-gradient(ellipse at 50% 40%, rgba(14,165,233,0.22), transparent 60%), #020910',
  },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_IDS = THEMES.map((t) => t.id) as ThemeId[];

/** Themes that actually animate — used by the "Random theme" action. */
export const ANIMATED_THEME_IDS = THEMES.filter(
  (t) => t.engine === 'canvas'
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
  subtle: 0.5,
  normal: 1.0,
  vivid: 1.5,
  ultra: 2.2,
};

export function isIntensity(v: string | null | undefined): v is EngineIntensity {
  return v === 'subtle' || v === 'normal' || v === 'vivid' || v === 'ultra';
}

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 3.0;

export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
}
