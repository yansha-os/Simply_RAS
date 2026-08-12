'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTheme, AccentColor, ColorMode, EngineIntensity } from './ThemeContext';
import { ThemeLayers, usePrefersReducedMotion } from '@/components/theme/ThemeBackground';
import {
  INTENSITY_FACTOR,
  THEMES,
  type ThemeDefinition,
} from '@/components/theme/themeRegistry';
import { X, Check, Palette, Sun, Moon, Shuffle, Sparkles, Gauge, Accessibility } from 'lucide-react';

/** Live scaled-down preview of a theme (real layers / real canvas, preview-capped). */
function ThemeMiniPreview({
  theme,
  intensity,
  speed,
  accent,
}: {
  theme: ThemeDefinition;
  intensity: EngineIntensity;
  speed: number;
  accent: AccentColor;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / 420);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isLive = theme.engine === 'css' || theme.engine === 'canvas';

  return (
    <div
      ref={ref}
      className="theme-mini w-full rounded-xl border border-white/10"
      style={
        {
          aspectRatio: '3 / 2',
          background: theme.baseColor,
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
                reducedMotion={false}
                preview
              />
            </div>
          )
        ) : (
          <div className="absolute inset-0" style={{ background: theme.staticBackground }} />
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
    colorMode,
    setColorMode,
    intensity,
    setIntensity,
    speed,
    setSpeed,
    accentSync,
    setAccentSync,
    randomizeTheme,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useTheme();
  const reducedMotion = usePrefersReducedMotion();

  if (!isSettingsOpen) return null;

  const accentColors: { id: AccentColor; name: string; bgClass: string }[] = [
    { id: 'orange', name: 'Dawn Orange', bgClass: 'bg-orange-500' },
    { id: 'cyan', name: 'Electric Cyan', bgClass: 'bg-cyan-500' },
    { id: 'purple', name: 'Royal Purple', bgClass: 'bg-purple-500' },
    { id: 'emerald', name: 'Emerald Green', bgClass: 'bg-emerald-500' },
    { id: 'rose', name: 'Rose Pink', bgClass: 'bg-rose-500' },
    { id: 'amber', name: 'Amber Gold', bgClass: 'bg-amber-500' },
  ];

  const intensities: { id: EngineIntensity; label: string; desc: string }[] = [
    { id: 'subtle', label: 'Subtle', desc: 'Dimmer, fewer particles' },
    { id: 'normal', label: 'Normal', desc: 'Balanced default' },
    { id: 'vivid', label: 'Vivid', desc: 'Brighter, denser, bolder' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="modal-content bg-zinc-950/95 border border-white/20 rounded-3xl p-6 max-w-4xl w-full space-y-6 shadow-2xl backdrop-blur-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-heading">Hyper-Custom Theme &amp; Animation Engine</h3>
              <p className="text-xs text-zinc-400 font-sans">
                {THEMES.length} themes · live previews · intensity, speed &amp; accent sync
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. COLOR MODE (LIGHT VS DARK) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">1. Color Mode Preference:</label>
            <span className="text-[10px] font-mono font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 rounded">
              Active: {colorMode.toUpperCase()} MODE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { id: 'light', name: 'Light Mode (RBT Default)', desc: 'Warm sunlit light theme', icon: Sun, iconClass: 'text-amber-400' },
                { id: 'dark', name: 'Dark Mode', desc: 'High-contrast dark theme', icon: Moon, iconClass: 'text-indigo-400' },
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
                      ? 'bg-orange-500/10 border-orange-500/50 text-white shadow-lg'
                      : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComp className={`w-5 h-5 ${c.iconClass}`} />
                    <div className="text-left">
                      <h4 className="font-bold text-xs">{c.name}</h4>
                      <p className="text-[10px] text-zinc-400">{c.desc}</p>
                    </div>
                  </div>
                  {colorMode === c.id && <Check className="w-4 h-4 text-orange-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. ANIMATED THEME GALLERY */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">2. Animated Background Theme:</label>
            <div className="flex items-center gap-2">
              {reducedMotion && (
                <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                  <Accessibility className="w-3 h-3" />
                  REDUCED MOTION — static fallbacks active
                </span>
              )}
              <button
                type="button"
                onClick={randomizeTheme}
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-white bg-white/5 hover:bg-[rgba(var(--accent-rgb-primary),0.15)] border border-white/15 hover:border-[rgba(var(--accent-rgb-primary),0.5)] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                <Shuffle className="w-3 h-3" />
                RANDOM THEME
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const isSelected = mode === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setMode(t.id)}
                  className={`group p-3 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col gap-2.5 hover:scale-[1.01] ${
                    isSelected
                      ? 'bg-[rgba(var(--accent-rgb-primary),0.08)] border-[rgba(var(--accent-rgb-primary),0.6)] ring-2 ring-[rgba(var(--accent-rgb-primary),0.35)] shadow-[0_0_24px_rgba(var(--accent-rgb-primary),0.18)]'
                      : 'bg-zinc-900/60 border-white/10 hover:border-white/25'
                  }`}
                >
                  <ThemeMiniPreview theme={t} intensity={intensity} speed={speed} accent={accent} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-xs font-sans truncate">{t.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-sans leading-snug mt-0.5 line-clamp-2">{t.description}</p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 shrink-0 rounded-full bg-[rgba(var(--accent-rgb-primary),1)] text-white flex items-center justify-center">
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

        {/* 3. ENGINE CONTROLS */}
        <div className="space-y-4 pt-2 border-t border-white/10">
          <label className="text-xs font-mono font-bold text-zinc-400 uppercase flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            3. Animation Engine Controls:
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Intensity */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Intensity</p>
              <div className="grid grid-cols-3 gap-1.5">
                {intensities.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIntensity(i.id)}
                    title={i.desc}
                    className={`px-2 py-2 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                      intensity === i.id
                        ? 'bg-[rgba(var(--accent-rgb-primary),0.15)] border-[rgba(var(--accent-rgb-primary),0.6)] text-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/25'
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 font-sans">Scales glow, opacity &amp; particle counts.</p>
            </div>

            {/* Speed */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Animation Speed</p>
                <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                  {speed.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-[rgb(var(--accent-rgb-primary))] cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 font-sans">0.5× calm drift → 2× energetic.</p>
            </div>

            {/* Glass opacity */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Panel Opacity</p>
                <span className="text-[10px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">{glassOpacity}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={90}
                step={5}
                value={glassOpacity}
                onChange={(e) => setGlassOpacity(parseInt(e.target.value, 10))}
                className="w-full accent-[rgb(var(--accent-rgb-primary))] cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500 font-sans">How much the background shows through panels.</p>
            </div>
          </div>
        </div>

        {/* 4. ACCENT COLOR PALETTE SELECTOR */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase">4. Primary Accent Color:</label>
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
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {accentColors.map((c) => {
              const isSelected = accent === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setAccent(c.id)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/10 border-white/40 shadow-md scale-105'
                      : 'bg-zinc-900/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full ${c.bgClass} shadow-sm`} />
                  <span className="text-[10px] font-mono text-zinc-300">{c.name.split(' ')[0]}</span>
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
    </div>
  );
}
