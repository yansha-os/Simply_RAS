'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import ThemeBackground from '@/components/theme/ThemeBackground';
import CursorTrailOverlay from '@/components/theme/CursorTrailOverlay';
import {
  clampSpeed,
  getTheme,
  isIntensity,
  isThemeId,
  randomThemeId,
  type AccentColor as RegistryAccentColor,
  type EngineIntensity,
  type ThemeId,
  type CursorTrailMode,
  type ClickEffectMode,
  type CursorHaloMode,
  type ClickSoundMode,
} from '@/components/theme/themeRegistry';

export type AnimationMode = ThemeId;
export type AccentColor = RegistryAccentColor;
export type ColorMode = 'light' | 'dark';
export type PerformanceMode = 'high' | 'eco';
export type { EngineIntensity, CursorTrailMode, ClickEffectMode, CursorHaloMode, ClickSoundMode };

export interface ThemePreset {
  version: 2;
  mode: AnimationMode;
  accent: AccentColor;
  customAccentHex?: string;
  glassOpacity: number;
  blurIntensity: number;
  colorMode: ColorMode;
  intensity: EngineIntensity;
  speed: number;
  performanceMode: PerformanceMode;
  accentSync: boolean;
  trailMode?: CursorTrailMode;
  clickEffect?: ClickEffectMode;
  haloMode?: CursorHaloMode;
  clickSound?: ClickSoundMode;
  soundVolume?: number;
  trailLength?: number;
  rippleIntensity?: number;
}

interface ThemeContextType {
  mode: AnimationMode;
  setMode: (mode: AnimationMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  customAccentHex: string;
  setCustomAccentHex: (hex: string) => void;
  glassOpacity: number;
  setGlassOpacity: (opacity: number) => void;
  blurIntensity: number;
  setBlurIntensity: (blur: number) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  intensity: EngineIntensity;
  setIntensity: (intensity: EngineIntensity) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  performanceMode: PerformanceMode;
  setPerformanceMode: (perf: PerformanceMode) => void;
  accentSync: boolean;
  setAccentSync: (sync: boolean) => void;
  circadianSync: boolean;
  setCircadianSync: (circadian: boolean) => void;
  trailMode: CursorTrailMode;
  setTrailMode: (mode: CursorTrailMode) => void;
  clickEffect: ClickEffectMode;
  setClickEffect: (effect: ClickEffectMode) => void;
  haloMode: CursorHaloMode;
  setHaloMode: (mode: CursorHaloMode) => void;
  clickSound: ClickSoundMode;
  setClickSound: (sound: ClickSoundMode) => void;
  soundVolume: number;
  setSoundVolume: (vol: number) => void;
  trailLength: number;
  setTrailLength: (len: number) => void;
  rippleIntensity: number;
  setRippleIntensity: (intensity: number) => void;
  cursorFxEnabled: boolean;
  setCursorFxEnabled: (enabled: boolean) => void;
  randomizeTheme: () => void;
  exportPreset: () => string;
  importPreset: (json: string) => boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeAttributes(
  m: AnimationMode,
  a: AccentColor,
  o: number,
  c: ColorMode,
  blur = 16,
  customHex = '#FF7A45'
) {
  const theme = getTheme(m);
  document.documentElement.setAttribute('data-mode', m);
  document.documentElement.setAttribute('data-accent', a);
  document.documentElement.setAttribute('data-color-mode', c);
  if (c === 'light') {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
  document.documentElement.setAttribute(
    'data-engine',
    theme.engine === 'css' || theme.engine === 'canvas' ? 'v2' : 'v1'
  );
  document.documentElement.style.setProperty('--glass-opacity', `${o / 100}`);
  document.documentElement.style.setProperty('--glass-opacity-light', `${Math.max(0.7, o / 100)}`);
  document.documentElement.style.setProperty('--glass-blur', `${blur}px`);
  if (a === 'custom') {
    document.documentElement.style.setProperty('--custom-accent', customHex);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AnimationMode>('professional-matte');
  const [accent, setAccentState] = useState<AccentColor>('orange');
  const [customAccentHex, setCustomAccentHexState] = useState<string>('#FF7A45');
  const [glassOpacity, setGlassOpacityState] = useState<number>(35);
  const [blurIntensity, setBlurIntensityState] = useState<number>(16);
  const [colorMode, setColorModeState] = useState<ColorMode>('light');
  const [intensity, setIntensityState] = useState<EngineIntensity>('normal');
  const [speed, setSpeedState] = useState<number>(1);
  const [performanceMode, setPerformanceModeState] = useState<PerformanceMode>('high');
  const [accentSync, setAccentSyncState] = useState<boolean>(true);
  const [circadianSync, setCircadianSyncState] = useState<boolean>(false);

  // Mouse FX & Cursor Physics — defaults off (opt-in via Theme Settings)
  const [trailMode, setTrailModeState] = useState<CursorTrailMode>('none');
  const [clickEffect, setClickEffectState] = useState<ClickEffectMode>('none');
  const [haloMode, setHaloModeState] = useState<CursorHaloMode>('none');
  const [clickSound, setClickSoundState] = useState<ClickSoundMode>('none');
  const [soundVolume, setSoundVolumeState] = useState<number>(0.5);
  const [trailLength, setTrailLengthState] = useState<number>(20);
  const [rippleIntensity, setRippleIntensityState] = useState<number>(1.0);
  const [cursorFxEnabled, setCursorFxEnabledState] = useState<boolean>(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const storedMode = localStorage.getItem('ras_theme_mode');
    const savedMode: AnimationMode = isThemeId(storedMode) ? storedMode : 'professional-matte';
    const savedAccent = (localStorage.getItem('ras_theme_accent') as AccentColor) || 'orange';
    const savedCustomHex = localStorage.getItem('ras_theme_custom_hex') || '#FF7A45';
    const savedOpacity = parseInt(localStorage.getItem('ras_theme_opacity') || '35', 10);
    const savedBlur = parseInt(localStorage.getItem('ras_theme_blur') || '16', 10);
    const savedColorMode = (localStorage.getItem('ras_rbt_color_mode') as ColorMode) || 'light';
    const storedIntensity = localStorage.getItem('ras_theme_intensity');
    const savedIntensity: EngineIntensity = isIntensity(storedIntensity) ? storedIntensity : 'normal';
    const savedSpeed = clampSpeed(parseFloat(localStorage.getItem('ras_theme_speed') || '1'));
    const savedPerformance = (localStorage.getItem('ras_theme_perf') as PerformanceMode) || 'high';
    const savedAccentSync = localStorage.getItem('ras_theme_accent_sync') !== 'off';
    const savedCircadian = localStorage.getItem('ras_theme_circadian') === 'on';

    const savedTrail = (localStorage.getItem('ras_cursor_trail') as CursorTrailMode) || 'none';
    const savedClick = (localStorage.getItem('ras_click_effect') as ClickEffectMode) || 'none';
    const savedHalo = (localStorage.getItem('ras_cursor_halo') as CursorHaloMode) || 'none';
    const savedSound = (localStorage.getItem('ras_click_sound') as ClickSoundMode) || 'none';
    const savedVol = parseFloat(localStorage.getItem('ras_sound_volume') || '0.5');
    const savedTrailLen = parseInt(localStorage.getItem('ras_trail_length') || '20', 10);
    const savedRipple = parseFloat(localStorage.getItem('ras_ripple_intensity') || '1.0');
    const savedCursorEnabled = localStorage.getItem('ras_cursor_enabled') === 'on';

    applyThemeAttributes(savedMode, savedAccent, savedOpacity, savedColorMode, savedBlur, savedCustomHex);

    const frame = window.requestAnimationFrame(() => {
      setModeState(savedMode);
      setAccentState(savedAccent);
      setCustomAccentHexState(savedCustomHex);
      setGlassOpacityState(savedOpacity);
      setBlurIntensityState(savedBlur);
      setColorModeState(savedColorMode);
      setIntensityState(savedIntensity);
      setSpeedState(savedSpeed);
      setPerformanceModeState(savedPerformance);
      setAccentSyncState(savedAccentSync);
      setCircadianSyncState(savedCircadian);

      setTrailModeState(savedTrail);
      setClickEffectState(savedClick);
      setHaloModeState(savedHalo);
      setClickSoundState(savedSound);
      setSoundVolumeState(savedVol);
      setTrailLengthState(savedTrailLen);
      setRippleIntensityState(savedRipple);
      setCursorFxEnabledState(savedCursorEnabled);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setMode = (newMode: AnimationMode) => {
    setModeState(newMode);
    localStorage.setItem('ras_theme_mode', newMode);
    let nextAccent = accent;
    const theme = getTheme(newMode);
    if (accentSync && (theme.engine === 'css' || theme.engine === 'canvas')) {
      nextAccent = theme.accent;
      setAccentState(nextAccent);
      localStorage.setItem('ras_theme_accent', nextAccent);
    }
    applyThemeAttributes(newMode, nextAccent, glassOpacity, colorMode, blurIntensity, customAccentHex);
  };

  const randomizeTheme = () => {
    setMode(randomThemeId(mode));
  };

  const setAccent = (newAccent: AccentColor) => {
    setAccentState(newAccent);
    localStorage.setItem('ras_theme_accent', newAccent);
    applyThemeAttributes(mode, newAccent, glassOpacity, colorMode, blurIntensity, customAccentHex);
  };

  const setCustomAccentHex = (hex: string) => {
    setCustomAccentHexState(hex);
    localStorage.setItem('ras_theme_custom_hex', hex);
    applyThemeAttributes(mode, accent, glassOpacity, colorMode, blurIntensity, hex);
  };

  const setGlassOpacity = (newOpacity: number) => {
    setGlassOpacityState(newOpacity);
    localStorage.setItem('ras_theme_opacity', `${newOpacity}`);
    applyThemeAttributes(mode, accent, newOpacity, colorMode, blurIntensity, customAccentHex);
  };

  const setBlurIntensity = (newBlur: number) => {
    setBlurIntensityState(newBlur);
    localStorage.setItem('ras_theme_blur', `${newBlur}`);
    applyThemeAttributes(mode, accent, glassOpacity, colorMode, newBlur, customAccentHex);
  };

  const setColorMode = (newColorMode: ColorMode) => {
    setColorModeState(newColorMode);
    localStorage.setItem('ras_rbt_color_mode', newColorMode);
    applyThemeAttributes(mode, accent, glassOpacity, newColorMode, blurIntensity, customAccentHex);
  };

  const setIntensity = (newIntensity: EngineIntensity) => {
    setIntensityState(newIntensity);
    localStorage.setItem('ras_theme_intensity', newIntensity);
  };

  const setSpeed = (newSpeed: number) => {
    const clamped = clampSpeed(newSpeed);
    setSpeedState(clamped);
    localStorage.setItem('ras_theme_speed', `${clamped}`);
  };

  const setPerformanceMode = (perf: PerformanceMode) => {
    setPerformanceModeState(perf);
    localStorage.setItem('ras_theme_perf', perf);
  };

  const setAccentSync = (sync: boolean) => {
    setAccentSyncState(sync);
    localStorage.setItem('ras_theme_accent_sync', sync ? 'on' : 'off');
  };

  const setCircadianSync = (circadian: boolean) => {
    setCircadianSyncState(circadian);
    localStorage.setItem('ras_theme_circadian', circadian ? 'on' : 'off');
  };

  const setTrailMode = (tm: CursorTrailMode) => {
    setTrailModeState(tm);
    localStorage.setItem('ras_cursor_trail', tm);
  };

  const setClickEffect = (ce: ClickEffectMode) => {
    setClickEffectState(ce);
    localStorage.setItem('ras_click_effect', ce);
  };

  const setHaloMode = (hm: CursorHaloMode) => {
    setHaloModeState(hm);
    localStorage.setItem('ras_cursor_halo', hm);
  };

  const setClickSound = (cs: ClickSoundMode) => {
    setClickSoundState(cs);
    localStorage.setItem('ras_click_sound', cs);
  };

  const setSoundVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setSoundVolumeState(clamped);
    localStorage.setItem('ras_sound_volume', `${clamped}`);
  };

  const setTrailLength = (len: number) => {
    setTrailLengthState(len);
    localStorage.setItem('ras_trail_length', `${len}`);
  };

  const setRippleIntensity = (ri: number) => {
    setRippleIntensityState(ri);
    localStorage.setItem('ras_ripple_intensity', `${ri}`);
  };

  const setCursorFxEnabled = (enabled: boolean) => {
    setCursorFxEnabledState(enabled);
    localStorage.setItem('ras_cursor_enabled', enabled ? 'on' : 'off');
  };

  const exportPreset = (): string => {
    const preset: ThemePreset = {
      version: 2,
      mode,
      accent,
      customAccentHex,
      glassOpacity,
      blurIntensity,
      colorMode,
      intensity,
      speed,
      performanceMode,
      accentSync,
      trailMode,
      clickEffect,
      haloMode,
      clickSound,
      soundVolume,
      trailLength,
      rippleIntensity,
    };
    return JSON.stringify(preset, null, 2);
  };

  const importPreset = (json: string): boolean => {
    try {
      const data = JSON.parse(json);
      if (data.mode && isThemeId(data.mode)) {
        setMode(data.mode);
        if (data.accent) setAccent(data.accent);
        if (data.customAccentHex) setCustomAccentHex(data.customAccentHex);
        if (typeof data.glassOpacity === 'number') setGlassOpacity(data.glassOpacity);
        if (typeof data.blurIntensity === 'number') setBlurIntensity(data.blurIntensity);
        if (data.intensity && isIntensity(data.intensity)) setIntensity(data.intensity);
        if (typeof data.speed === 'number') setSpeed(data.speed);
        if (data.trailMode) setTrailMode(data.trailMode);
        if (data.clickEffect) setClickEffect(data.clickEffect);
        if (data.haloMode) setHaloMode(data.haloMode);
        if (data.clickSound) setClickSound(data.clickSound);
        if (typeof data.soundVolume === 'number') setSoundVolume(data.soundVolume);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        accent,
        setAccent,
        customAccentHex,
        setCustomAccentHex,
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
      }}
    >
      <ThemeBackground
        mode={mode}
        intensity={performanceMode === 'eco' ? 'subtle' : intensity}
        speed={performanceMode === 'eco' ? Math.min(speed, 0.75) : speed}
        accent={accent}
        colorMode={colorMode}
        cursorFxEnabled={cursorFxEnabled}
      />
      {cursorFxEnabled && (
        <CursorTrailOverlay
          trailMode={performanceMode === 'eco' ? 'none' : trailMode}
          clickEffect={clickEffect}
          haloMode={haloMode}
          clickSound={clickSound}
          soundVolume={soundVolume}
          trailLength={trailLength}
          rippleIntensity={rippleIntensity}
          accent={accent}
          enabled={cursorFxEnabled}
        />
      )}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
