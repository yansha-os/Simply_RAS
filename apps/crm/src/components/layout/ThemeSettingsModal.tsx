'use client';

import React from 'react';
import { useTheme, AnimationMode, AccentColor, ColorMode } from './ThemeContext';
import { X, Check, Palette, Sparkles, Sliders, Monitor, Layers, Cpu, Sun, Moon } from 'lucide-react';

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
    isSettingsOpen,
    setIsSettingsOpen,
  } = useTheme();

  if (!isSettingsOpen) return null;

  const animationModes: { id: AnimationMode; name: string; tag: string; desc: string; previewBg: string; icon: any }[] = [
    {
      id: 'professional-matte',
      name: 'Professional Matte (Default)',
      tag: '0% GPU Load - Clean Finish',
      desc: 'Sleek, high-contrast matte canvas with 0 background animations for maximum speed & focus.',
      previewBg: 'bg-zinc-950 border-zinc-800',
      icon: Cpu,
    },
    {
      id: 'cosmic-stars',
      name: 'Cosmic Starry Night',
      tag: 'Sparkling Meteors',
      desc: 'Multi-layered sparkling starry night canvas with floating meteor shooting stars.',
      previewBg: 'bg-gradient-to-r from-slate-950 via-orange-950 to-zinc-950',
      icon: Sparkles,
    },
    {
      id: 'liquid-aurora',
      name: 'Liquid Aurora Wave Mesh',
      tag: 'Flowing Gradients',
      desc: 'Dynamic organic flowing liquid gradient waves & floating ambient light mesh.',
      previewBg: 'bg-gradient-to-r from-teal-950 via-indigo-950 to-purple-950',
      icon: Layers,
    },
    {
      id: 'cyberpunk-grid',
      name: 'Cyberpunk Digital Grid',
      tag: 'Pulsing Neon Vectors',
      desc: 'Pulsing cyan neon digital grid floor + floating data vector streams.',
      previewBg: 'bg-gradient-to-r from-zinc-950 via-cyan-950 to-slate-950',
      icon: Monitor,
    },
  ];

  const accentColors: { id: AccentColor; name: string; hex: string; bgClass: string }[] = [
    { id: 'orange', name: 'Dawn Orange', hex: '#FF7A45', bgClass: 'bg-orange-500' },
    { id: 'cyan', name: 'Electric Cyan', hex: '#06B6D4', bgClass: 'bg-cyan-500' },
    { id: 'purple', name: 'Royal Purple', hex: '#A855F7', bgClass: 'bg-purple-500' },
    { id: 'emerald', name: 'Emerald Green', hex: '#10B981', bgClass: 'bg-emerald-500' },
    { id: 'rose', name: 'Rose Pink', hex: '#F43F5E', bgClass: 'bg-rose-500' },
    { id: 'amber', name: 'Amber Gold', hex: '#F59E0B', bgClass: 'bg-amber-500' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="modal-content bg-zinc-950/95 border border-white/20 rounded-3xl p-6 max-w-2xl w-full space-y-6 shadow-2xl backdrop-blur-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-heading">Hyper-Custom Theme &amp; Animation Engine</h3>
              <p className="text-xs text-zinc-400 font-sans">Customize color modes, background animations, accent colors, and transparency</p>
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
            <button
              type="button"
              onClick={() => setColorMode('light')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                colorMode === 'light'
                  ? 'bg-orange-500/10 border-orange-500/50 text-white shadow-lg'
                  : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sun className="w-5 h-5 text-amber-400" />
                <div className="text-left">
                  <h4 className="font-bold text-xs">Light Mode (RBT Default)</h4>
                  <p className="text-[10px] text-zinc-400">Warm sunlit light theme</p>
                </div>
              </div>
              {colorMode === 'light' && <Check className="w-4 h-4 text-orange-400" />}
            </button>

            <button
              type="button"
              onClick={() => setColorMode('dark')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                colorMode === 'dark'
                  ? 'bg-orange-500/10 border-orange-500/50 text-white shadow-lg'
                  : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-indigo-400" />
                <div className="text-left">
                  <h4 className="font-bold text-xs">Dark Mode</h4>
                  <p className="text-[10px] text-zinc-400">High-contrast dark theme</p>
                </div>
              </div>
              {colorMode === 'dark' && <Check className="w-4 h-4 text-orange-400" />}
            </button>
          </div>
        </div>

        {/* 2. BACKGROUND ANIMATION CANVAS MODES */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <label className="text-xs font-mono font-bold text-zinc-400 uppercase block">2. Select Animation Canvas Mode:</label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {animationModes.map((m) => {
              const IconComp = m.icon;
              const isSelected = mode === m.id;

              return (
                <div
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-500/50 shadow-[0_0_20px_rgba(255,122,69,0.2)]'
                      : 'bg-zinc-900/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${m.previewBg} border border-white/20 flex items-center justify-center text-white shrink-0`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-white text-xs font-sans">{m.name}</h4>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">{m.desc}</p>

                  <span className="text-[9px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 w-max">
                    {m.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. ACCENT COLOR PALETTE SELECTOR */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <label className="block text-xs font-mono font-bold text-zinc-400 uppercase">3. Select Primary Accent Color:</label>
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
