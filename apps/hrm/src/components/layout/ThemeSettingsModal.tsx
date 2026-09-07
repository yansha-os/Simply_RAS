'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  useTheme,
  AccentColor,
  ColorMode,
  EngineIntensity,
  CursorTrailMode,
  ClickEffectMode,
  CursorHaloMode,
  ClickSoundMode,
} from './ThemeContext';
import { ThemeLayers, usePrefersReducedMotion } from '@/components/theme/ThemeBackground';
import {
  INTENSITY_FACTOR,
  THEMES,
  type ThemeDefinition,
  type ThemeCategory,
} from '@/components/theme/themeRegistry';
import { playClickSound } from '@/components/theme/audioSynth';
import {
  X,
  Check,
  Palette,
  Sun,
  Moon,
  Shuffle,
  Sparkles,
  Gauge,
  Accessibility,
  Search,
  Sliders,
  Copy,
  BatteryCharging,
  Clock,
  MousePointer,
  Radio,
  Zap,
  Volume2,
  Crosshair,
  Flame,
  Activity,
} from 'lucide-react';

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Live scaled-down preview of a theme (real layers / real canvas, preview-capped). */
function ThemeMiniPreview({
  theme,
  intensity,
  speed,
  accent,
  colorMode = 'dark',
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
  colorMode?: 'light' | 'dark';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 0;
      setScale(w > 0 ? w / 1920 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isLive = theme.engine === 'css' || theme.engine === 'canvas';
  const isLight = colorMode === 'light';
  const effectiveBase = isLight ? (theme.lightBaseColor || '#FFFDF8') : theme.baseColor;
  const effectiveStatic = isLight ? (theme.lightStaticBackground || theme.staticBackground) : theme.staticBackground;

  return (
    <div
      ref={ref}
      className="theme-mini w-full rounded-xl border border-white/10 relative overflow-hidden"
      style={
        {
          aspectRatio: '3 / 2',
          background: effectiveBase,
          '--ti': INTENSITY_FACTOR[intensity],
          '--ts': speed,
        } as React.CSSProperties
      }
    >
      {scale > 0 &&
        (isLive && !reducedMotion ? (
          theme.engine === 'canvas' ? (
            <ThemeLayers
              theme={theme}
              intensity={intensity}
              speed={speed}
              accent={accent}
              colorMode={colorMode}
              reducedMotion={false}
              preview
            />
          ) : (
            <div className="theme-mini-viewport" style={{ transform: `scale(${scale})` }}>
              <ThemeLayers
                theme={theme}
                intensity={intensity}
                speed={speed}
                accent={accent}
                colorMode={colorMode}
                reducedMotion={false}
                preview
              />
            </div>
          )
        ) : (
          <div className="absolute inset-0" style={{ background: effectiveStatic }} />
        ))}
      {isLive && !reducedMotion && (
        <span className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[8px] font-mono font-bold text-emerald-400 bg-black/50 border border-emerald-500/30 px-1.5 py-0.5 rounded backdrop-blur-sm">
          <span className="dot-live !w-[4px] !h-[4px]" /> LIVE
        </span>
      )}
    </div>
  );
}

export default function ThemeSettingsModal() {
  const {
    mode,
    setMode,
    accent,
    setAccent,
    glassOpacity,
    setGlassOpacity,
    blurIntensity,
    setBlurIntensity,
    colorMode,
    setColorMode,
    intensity,
    setIntensity,
    speed,
    setSpeed,
    performanceMode,
    setPerformanceMode,
    accentSync,
    setAccentSync,
    circadianSync,
    setCircadianSync,
    trailMode,
    setTrailMode,
    clickEffect,
    setClickEffect,
    haloMode,
    setHaloMode,
    clickSound,
    setClickSound,
    soundVolume,
    setSoundVolume,
    trailLength,
    setTrailLength,
    rippleIntensity,
    setRippleIntensity,
    cursorFxEnabled,
    setCursorFxEnabled,
    randomizeTheme,
    exportPreset,
    importPreset,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useTheme();

  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
  const [activeCategory, setActiveCategory] = useState<ThemeCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [playgroundClicks, setPlaygroundClicks] = useState(0);

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, setIsSettingsOpen]);

  if (!isSettingsOpen || !mounted) return null;

  const accentColors: { id: AccentColor; name: string; bgClass: string; hex: string }[] = [
    { id: 'orange', name: 'Dawn Orange', bgClass: 'bg-orange-500', hex: '#FF7A45' },
    { id: 'cyan', name: 'Electric Cyan', bgClass: 'bg-cyan-500', hex: '#06B6D4' },
    { id: 'purple', name: 'Royal Purple', bgClass: 'bg-purple-500', hex: '#A855F7' },
    { id: 'emerald', name: 'Emerald Green', bgClass: 'bg-emerald-500', hex: '#10B981' },
    { id: 'rose', name: 'Rose Pink', bgClass: 'bg-rose-500', hex: '#F43F5E' },
    { id: 'amber', name: 'Amber Gold', bgClass: 'bg-amber-500', hex: '#F59E0B' },
    { id: 'lime', name: 'Electric Lime', bgClass: 'bg-lime-500', hex: '#84CC16' },
    { id: 'magenta', name: 'Neon Magenta', bgClass: 'bg-fuchsia-500', hex: '#D946EF' },
    { id: 'gold', name: 'Solar Gold', bgClass: 'bg-yellow-500', hex: '#EAB308' },
    { id: 'violet', name: 'Deep Violet', bgClass: 'bg-violet-600', hex: '#7C3AED' },
    { id: 'aqua', name: 'Aquamarine', bgClass: 'bg-sky-500', hex: '#0EA5E9' },
    { id: 'pink', name: 'Plasma Pink', bgClass: 'bg-pink-400', hex: '#F472B6' },
    { id: 'coral', name: 'Sunset Coral', bgClass: 'bg-orange-400', hex: '#FB923C' },
    { id: 'ice', name: 'Arctic Ice', bgClass: 'bg-sky-400', hex: '#38BDF8' },
    { id: 'indigo', name: 'Indigo Dream', bgClass: 'bg-indigo-500', hex: '#6366F1' },
    { id: 'teal', name: 'Teal Lagoon', bgClass: 'bg-teal-500', hex: '#14B8A6' },
    { id: 'crimson', name: 'Crimson Flare', bgClass: 'bg-rose-600', hex: '#E11D48' },
  ];

  const intensities: { id: EngineIntensity; label: string; desc: string }[] = [
    { id: 'subtle', label: 'Subtle', desc: 'Dimmer, battery friendly' },
    { id: 'normal', label: 'Normal', desc: 'Balanced default' },
    { id: 'vivid', label: 'Vivid', desc: 'High particle density' },
    { id: 'ultra', label: 'Ultra', desc: 'Maximum particles & glow' },
  ];

  const categories: { id: ThemeCategory; label: string }[] = [
    { id: 'all', label: 'All Themes' },
    { id: 'cosmos', label: 'Cosmos & Space' },
    { id: 'cyber', label: 'Cyber & Tech' },
    { id: 'organic', label: 'Organic & Nature' },
    { id: 'fractal', label: 'Fractal & Geometry' },
    { id: 'minimal', label: 'Minimal & Matte' },
  ];

  const cursorTrailOptions: { id: CursorTrailMode; label: string; desc: string }[] = [
    { id: 'stardust', label: 'Stardust Sparkles', desc: 'Glittering stardust particles' },
    { id: 'neon-plasma', label: 'Neon Plasma Ribbon', desc: 'Laser ribbon tracing cursor path' },
    { id: 'cyber-matrix', label: 'Cyber Matrix Cascade', desc: 'Binary code falling from cursor' },
    { id: 'fluid-smoke', label: 'Fluid Smoke Vapor', desc: 'Soft expanding vapor clouds' },
    { id: 'gravity-field', label: 'Quantum Satellites', desc: 'Orbiting quantum particles' },
    { id: 'rainbow-sparkler', label: 'Rainbow Sparkler', desc: 'Multi-colored glittering ember sparks' },
    { id: 'fire-flame', label: 'Fiery Embers', desc: 'Rising turbulent flame sparks' },
    { id: 'lightning-tendrils', label: 'Plasma Lightning', desc: 'Branching electric plasma tendrils' },
    { id: 'crystal-prism', label: 'Crystal Prisms', desc: 'Floating rotating diamond crystals' },
    { id: 'bubble-float', label: 'Soap Bubbles', desc: 'Iridescent floating soap bubbles' },
    { id: 'hyper-warp', label: 'Hyper Warp Streaks', desc: 'Radial hyperspace velocity streaks' },
    { id: 'none', label: 'Disabled', desc: 'Standard cursor behavior' },
  ];

  const clickEffectOptions: { id: ClickEffectMode; label: string; desc: string }[] = [
    { id: 'shockwave-ring', label: 'Shockwave Ring', desc: 'Expanding high-speed shockwave' },
    { id: 'particle-burst', label: 'Particle Burst', desc: 'Firework spark explosion' },
    { id: 'ripple-distortion', label: 'Concentric Ripples', desc: 'Multi-ring water ripple waves' },
    { id: 'electric-arc', label: 'Electric Arc Lightning', desc: 'Branching lightning sparks' },
    { id: 'supernova-implosion', label: 'Supernova Implosion', desc: 'Vortex collapse into outward blast' },
    { id: 'confetti-blast', label: 'Confetti Blast', desc: '3D tumbling festive confetti' },
    { id: 'quantum-shatter', label: 'Quantum Shatter', desc: 'Geometric shards with rotation' },
    { id: 'magnetic-pulse', label: 'Magnetic Flux Pulse', desc: 'Concentric pulsing magnetic flux' },
    { id: 'none', label: 'Disabled', desc: 'No click animation' },
  ];

  const haloOptions: { id: CursorHaloMode; label: string; desc: string }[] = [
    { id: 'none', label: 'None', desc: 'Default OS pointer' },
    { id: 'halo-glow', label: 'Luminous Glow', desc: 'Soft glowing aura following pointer' },
    { id: 'tech-crosshair', label: 'Sci-Fi Reticle', desc: 'Animated spinning crosshair' },
    { id: 'magnetic-dot', label: 'Magnetic Spring Dot', desc: 'Trailing dot with spring ring' },
    { id: 'cyber-pulse', label: 'Cyber HUD Bracket', desc: 'Pulsing targeting bracket' },
  ];

  const soundOptions: { id: ClickSoundMode; label: string; desc: string }[] = [
    { id: 'none', label: 'Muted', desc: 'No audio synthesis' },
    { id: 'subtle-click', label: 'Tactile Switch', desc: 'Snappy mechanical click' },
    { id: 'sci-fi-blip', label: 'Laser Blip', desc: 'Holographic synth sweep' },
    { id: 'bubble-pop', label: 'Bubble Pop', desc: 'Resonant liquid pop' },
    { id: 'quantum-pulse', label: 'Cosmic Chime', desc: 'Harmonic chord pulse' },
  ];

  const filteredThemes = THEMES.filter((t) => {
    const matchesCat = activeCategory === 'all' || t.category === activeCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.tag.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const handleCopyPreset = () => {
    const json = exportPreset();
    navigator.clipboard.writeText(json);
    setCopiedStatus(true);
    setTimeout(() => setCopiedStatus(false), 2000);
  };

  const handleImportPreset = () => {
    if (importPreset(importJsonText)) {
      setPresetModalOpen(false);
      setImportJsonText('');
    }
  };

  const testClickSound = (snd: ClickSoundMode) => {
    setClickSound(snd);
    playClickSound(snd, soundVolume);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={() => setIsSettingsOpen(false)}
    >
      <div
        className="my-auto modal-content bg-zinc-950/95 border border-white/20 rounded-3xl p-6 max-w-5xl w-full space-y-6 shadow-2xl backdrop-blur-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.25)]">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white font-heading tracking-tight">
                Hyper-Custom Theme &amp; Animation Engine 2.0
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                {THEMES.length} Themes · 12 Mouse Trails · 8 Click Shockwaves · Procedural Sound Synth · Light &amp; Dark Modes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPresetModalOpen(!presetModalOpen)}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition cursor-pointer flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-orange-400" />
              Presets
            </button>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRESET IMPORT / EXPORT DRAWER */}
        {presetModalOpen && (
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-orange-400 uppercase">
                Theme Preset Export &amp; Import
              </span>
              <button
                type="button"
                onClick={handleCopyPreset}
                className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-[11px] font-mono font-bold text-orange-300 hover:bg-orange-500/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <Copy className="w-3 h-3" />
                {copiedStatus ? 'Copied to Clipboard!' : 'Copy Current Preset JSON'}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste preset JSON string here to import..."
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
              <button
                type="button"
                onClick={handleImportPreset}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs cursor-pointer transition"
              >
                Apply Preset
              </button>
            </div>
          </div>
        )}

        {/* 1. COLOR MODE (LIGHT VS DARK) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">
              1. Color Mode Preference:
            </label>
            <span className="text-[10px] font-mono font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 rounded">
              Active: {colorMode.toUpperCase()} MODE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { id: 'light', name: 'Light Mode (Luminous Frosted Glass)', desc: 'Clean sunlit high-clarity light theme with zero black surfaces and crisp borders', icon: Sun, iconClass: 'text-amber-400' },
                { id: 'dark', name: 'Dark Mode (Deep Space & OLED)', desc: 'High-contrast obsidian deep space dark theme with glowing neon accents', icon: Moon, iconClass: 'text-indigo-400' },
              ] as { id: ColorMode; name: string; desc: string; icon: typeof Sun; iconClass: string }[]
            ).map((c) => {
              const IconComp = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorMode(c.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    colorMode === c.id
                      ? 'bg-orange-500/10 border-orange-500/50 text-white shadow-lg ring-1 ring-orange-500/30'
                      : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComp className={`w-5 h-5 ${c.iconClass}`} />
                    <div className="text-left">
                      <h4 className="font-bold text-xs text-white">{c.name}</h4>
                      <p className="text-[10px] text-zinc-400">{c.desc}</p>
                    </div>
                  </div>
                  {colorMode === c.id && <Check className="w-4 h-4 text-orange-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. ADVANCED INTERACTIVE MOUSE TRAILS & PHYSICS CENTER */}
        <div className="space-y-4 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase flex items-center gap-1.5">
              <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
              2. Interactive Mouse Physics, Trails, Reticles &amp; Audio Synthesis:
            </label>
            <button
              type="button"
              onClick={() => setCursorFxEnabled(!cursorFxEnabled)}
              className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                cursorFxEnabled
                  ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                  : 'text-zinc-400 bg-white/5 border-white/10 hover:border-white/25'
              }`}
            >
              <Radio className="w-3 h-3" />
              CURSOR FX: {cursorFxEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* Interactive Live Playground Test Pad */}
          <div
            onClick={() => setPlaygroundClicks((c) => c + 1)}
            className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/20 via-zinc-900/60 to-orange-950/20 border border-cyan-500/30 text-center cursor-pointer transition-all hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] select-none"
          >
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1">
              <span className="flex items-center gap-1 text-cyan-400 font-bold">
                <Activity className="w-3.5 h-3.5 animate-pulse" /> LIVE INTERACTIVE TEST PAD
              </span>
              <span className="text-[10px] text-zinc-500">Clicks: {playgroundClicks}</span>
            </div>
            <p className="text-xs text-zinc-300 font-sans">
              Move your mouse and click anywhere in this box to test active <strong className="text-cyan-400">{trailMode}</strong> trail, <strong className="text-orange-400">{clickEffect}</strong> shockwave, and <strong className="text-emerald-400">{clickSound}</strong> sound blip!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Trail Mode Selector (12 styles) */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Flame className="w-3 h-3 text-cyan-400" /> Mouse Trail Style ({cursorTrailOptions.length})
                </p>
                <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase">{trailMode}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {cursorTrailOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTrailMode(opt.id)}
                    title={opt.desc}
                    className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold text-left transition cursor-pointer ${
                      trailMode === opt.id
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-white shadow-sm ring-1 ring-cyan-500/40'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Trail Length</span>
                  <span className="text-white font-bold">{trailLength} pts</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={trailLength}
                  onChange={(e) => setTrailLength(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Click Effect Selector (8 styles) */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3 text-orange-400" /> Click Shockwave Physics ({clickEffectOptions.length})
                </p>
                <span className="text-[9px] font-mono text-orange-400 font-bold uppercase">{clickEffect}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {clickEffectOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setClickEffect(opt.id)}
                    title={opt.desc}
                    className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold text-left transition cursor-pointer ${
                      clickEffect === opt.id
                        ? 'bg-orange-500/20 border-orange-500/60 text-white shadow-sm ring-1 ring-orange-500/40'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Shockwave Ripple Multiplier</span>
                  <span className="text-white font-bold">{rippleIntensity.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.25}
                  value={rippleIntensity}
                  onChange={(e) => setRippleIntensity(parseFloat(e.target.value))}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Halo Reticle & Web Audio Synthesizer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pointer Halo & HUD Reticles */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Crosshair className="w-3 h-3 text-purple-400" /> Cursor Halo &amp; Target Reticle
                </p>
                <span className="text-[9px] font-mono text-purple-400 font-bold uppercase">{haloMode}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {haloOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setHaloMode(opt.id)}
                    title={opt.desc}
                    className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold text-left transition cursor-pointer ${
                      haloMode === opt.id
                        ? 'bg-purple-500/20 border-purple-500/60 text-white shadow-sm ring-1 ring-purple-500/40'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 font-sans">Real-time target crosshair tracking following pointer.</p>
            </div>

            {/* Web Audio API Synthesizer Click Sound */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-emerald-400" /> Web Audio Synthesizer Click SFX
                </p>
                <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase">{clickSound}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {soundOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => testClickSound(opt.id)}
                    title={opt.desc}
                    className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold text-left transition cursor-pointer ${
                      clickSound === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Synthesizer Volume</span>
                  <span className="text-white font-bold">{Math.round(soundVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. ANIMATED THEME GALLERY */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">
              3. Animated Background Themes ({filteredThemes.length} / {THEMES.length}):
            </label>
            <div className="flex items-center gap-2">
              {reducedMotion && (
                <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                  <Accessibility className="w-3 h-3" />
                  REDUCED MOTION ACTIVE
                </span>
              )}
              <button
                type="button"
                onClick={randomizeTheme}
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-white bg-white/5 hover:bg-orange-500/20 border border-white/15 hover:border-orange-500/50 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                <Shuffle className="w-3 h-3 text-orange-400" />
                RANDOM THEME
              </button>
            </div>
          </div>

          {/* Category tabs & Search */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold transition cursor-pointer ${
                    activeCategory === cat.id
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5 hover:border-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search themes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredThemes.map((t) => {
              const isSelected = mode === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setMode(t.id)}
                  className={`group p-3 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col gap-2.5 hover:scale-[1.01] ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-500/60 ring-2 ring-orange-500/30 shadow-[0_0_24px_rgba(249,115,22,0.2)]'
                      : 'bg-zinc-900/60 border-white/10 hover:border-white/25'
                  }`}
                >
                  <ThemeMiniPreview theme={t} intensity={intensity} speed={speed} accent={accent} colorMode={colorMode} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-xs font-sans truncate">{t.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-sans leading-snug mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 shrink-0 rounded-full bg-orange-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 w-max">
                    {t.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. ENGINE CONTROLS & OPTICS */}
        <div className="space-y-4 pt-2 border-t border-white/10">
          <label className="text-xs font-mono font-bold text-zinc-400 uppercase flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            4. Animation Engine, Physics &amp; Optics:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Intensity */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Intensity</p>
              <div className="grid grid-cols-2 gap-1.5">
                {intensities.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIntensity(i.id)}
                    title={i.desc}
                    className={`px-2 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                      intensity === i.id
                        ? 'bg-orange-500/20 border-orange-500/60 text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/25'
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 font-sans">Particle density &amp; luminescence.</p>
            </div>

            {/* Speed */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Velocity</p>
                <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                  {speed.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.25}
                max={3.0}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 font-sans">0.25× ambient drift → 3.0× high energy.</p>
            </div>

            {/* Glass Opacity */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Glass Opacity</p>
                <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                  {glassOpacity}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={95}
                step={5}
                value={glassOpacity}
                onChange={(e) => setGlassOpacity(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 font-sans">Card backdrop translucency.</p>
            </div>

            {/* Blur Intensity */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Backdrop Blur</p>
                <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                  {blurIntensity}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={32}
                step={2}
                value={blurIntensity}
                onChange={(e) => setBlurIntensity(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 font-sans">0px crisp → 32px ultra glassmorphism.</p>
            </div>
          </div>

          {/* Performance & Circadian Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPerformanceMode(performanceMode === 'high' ? 'eco' : 'high')}
              className={`p-3 rounded-2xl border flex items-center justify-between transition cursor-pointer ${
                performanceMode === 'eco'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-900/50 border-white/10 text-zinc-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
                <div className="text-left">
                  <span className="text-xs font-bold block">Eco / Battery Saver Mode</span>
                  <span className="text-[10px] text-zinc-400">Limits canvas resolution and capped fps</span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold uppercase">{performanceMode}</span>
            </button>

            <button
              type="button"
              onClick={() => setCircadianSync(!circadianSync)}
              className={`p-3 rounded-2xl border flex items-center justify-between transition cursor-pointer ${
                circadianSync
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-zinc-900/50 border-white/10 text-zinc-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <div className="text-left">
                  <span className="text-xs font-bold block">Circadian Day/Night Sync</span>
                  <span className="text-[10px] text-zinc-400">Shifts color mode automatically with local time</span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold uppercase">{circadianSync ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* 5. ACCENT COLOR PALETTE SELECTOR */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">
              5. Primary Accent Color ({accentColors.length} Curated Tones):
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAccentSync(!accentSync)}
                className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  accentSync
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-zinc-400 bg-white/5 border-white/10 hover:border-white/25'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                SYNC ACCENT TO THEME: {accentSync ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-2.5">
            {accentColors.map((c) => {
              const isSelected = accent === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setAccent(c.id)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/10 border-white/40 shadow-md scale-105 ring-1 ring-white/30'
                      : 'bg-zinc-900/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full ${c.bgClass} shadow-sm`} />
                  <span className="text-[10px] font-mono text-zinc-300 truncate w-full text-center">
                    {c.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <div className="pt-3 border-t border-white/10 flex justify-end">
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
          >
            Apply Theme &amp; Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
