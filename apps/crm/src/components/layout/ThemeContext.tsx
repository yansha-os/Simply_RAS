'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import ThemeBackground from '@/components/theme/ThemeBackground';
import {
  clampSpeed,
  getTheme,
  isIntensity,
  isThemeId,
  randomThemeId,
  type AccentColor as RegistryAccentColor,
  type EngineIntensity,
  type ThemeId,
} from '@/components/theme/themeRegistry';

export type AnimationMode = ThemeId;
export type AccentColor = RegistryAccentColor;
export type ColorMode = 'light' | 'dark';
export type { EngineIntensity };

interface ThemeContextType {
  mode: AnimationMode;
  setMode: (mode: AnimationMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  glassOpacity: number;
  setGlassOpacity: (opacity: number) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  intensity: EngineIntensity;
  setIntensity: (intensity: EngineIntensity) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  accentSync: boolean;
  setAccentSync: (sync: boolean) => void;
  randomizeTheme: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeAttributes(m: AnimationMode, a: AccentColor, o: number, c: ColorMode) {
  const theme = getTheme(m);
  document.documentElement.setAttribute('data-mode', m);
  document.documentElement.setAttribute('data-accent', a);
  document.documentElement.setAttribute('data-color-mode', c);
  // v2 engine themes silence the legacy fog/star layers via CSS.
  document.documentElement.setAttribute(
    'data-engine',
    theme.engine === 'css' || theme.engine === 'canvas' ? 'v2' : 'v1'
  );
  document.documentElement.style.setProperty('--glass-opacity', `${o / 100}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AnimationMode>('professional-matte');
  const [accent, setAccentState] = useState<AccentColor>('orange');
  const [glassOpacity, setGlassOpacityState] = useState<number>(35);
  const [colorMode, setColorModeState] = useState<ColorMode>('light');
  const [intensity, setIntensityState] = useState<EngineIntensity>('normal');
  const [speed, setSpeedState] = useState<number>(1);
  const [accentSync, setAccentSyncState] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const storedMode = localStorage.getItem('ras_theme_mode');
    const savedMode: AnimationMode = isThemeId(storedMode) ? storedMode : 'professional-matte';
    const savedAccent = (localStorage.getItem('ras_theme_accent') as AccentColor) || 'orange';
    const savedOpacity = parseInt(localStorage.getItem('ras_theme_opacity') || '35', 10);
    // RBT default is ALWAYS 'light' mode unless explicitly saved as 'dark' in settings
    const savedColorMode = (localStorage.getItem('ras_rbt_color_mode') as ColorMode) || 'light';
    const storedIntensity = localStorage.getItem('ras_theme_intensity');
    const savedIntensity: EngineIntensity = isIntensity(storedIntensity) ? storedIntensity : 'normal';
    const savedSpeed = clampSpeed(parseFloat(localStorage.getItem('ras_theme_speed') || '1'));
    const savedAccentSync = localStorage.getItem('ras_theme_accent_sync') !== 'off';

    setModeState(savedMode);
    setAccentState(savedAccent);
    setGlassOpacityState(savedOpacity);
    setColorModeState(savedColorMode);
    setIntensityState(savedIntensity);
    setSpeedState(savedSpeed);
    setAccentSyncState(savedAccentSync);

    applyThemeAttributes(savedMode, savedAccent, savedOpacity, savedColorMode);
  }, []);

  const setMode = (newMode: AnimationMode) => {
    setModeState(newMode);
    localStorage.setItem('ras_theme_mode', newMode);
    let nextAccent = accent;
    // Per-theme accent sync: adopting a theme also adopts its paired accent.
    const theme = getTheme(newMode);
    if (accentSync && (theme.engine === 'css' || theme.engine === 'canvas')) {
      nextAccent = theme.accent;
      setAccentState(nextAccent);
      localStorage.setItem('ras_theme_accent', nextAccent);
    }
    applyThemeAttributes(newMode, nextAccent, glassOpacity, colorMode);
  };

  const randomizeTheme = () => {
    setMode(randomThemeId(mode));
  };

  const setAccent = (newAccent: AccentColor) => {
    setAccentState(newAccent);
    localStorage.setItem('ras_theme_accent', newAccent);
    applyThemeAttributes(mode, newAccent, glassOpacity, colorMode);
  };

  const setGlassOpacity = (newOpacity: number) => {
    setGlassOpacityState(newOpacity);
    localStorage.setItem('ras_theme_opacity', `${newOpacity}`);
    applyThemeAttributes(mode, accent, newOpacity, colorMode);
  };

  const setColorMode = (newColorMode: ColorMode) => {
    setColorModeState(newColorMode);
    localStorage.setItem('ras_rbt_color_mode', newColorMode);
    applyThemeAttributes(mode, accent, glassOpacity, newColorMode);
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

  const setAccentSync = (sync: boolean) => {
    setAccentSyncState(sync);
    localStorage.setItem('ras_theme_accent_sync', sync ? 'on' : 'off');
  };

  return (
    <ThemeContext.Provider
      value={{
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
      }}
    >
      <ThemeBackground mode={mode} intensity={intensity} speed={speed} accent={accent} />
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
