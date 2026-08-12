'use client';

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
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

const THEME_STORAGE_KEYS = [
  'ras_theme_mode',
  'ras_theme_accent',
  'ras_theme_opacity',
  'ras_rbt_color_mode',
  'ras_theme_intensity',
  'ras_theme_speed',
  'ras_theme_accent_sync',
] as const;

type ThemeStorageKey = (typeof THEME_STORAGE_KEYS)[number];

const THEME_STORAGE_EVENT = 'ras-theme-storage-change';
const EMPTY_THEME_STORAGE_SNAPSHOT = THEME_STORAGE_KEYS.map(() => '').join('\u0000');

function subscribeToThemeStorage(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || THEME_STORAGE_KEYS.some((key) => key === event.key)) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(THEME_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(THEME_STORAGE_EVENT, callback);
  };
}

function getThemeStorageSnapshot() {
  return THEME_STORAGE_KEYS.map((key) => localStorage.getItem(key) ?? '').join('\u0000');
}

function getServerThemeStorageSnapshot() {
  return EMPTY_THEME_STORAGE_SNAPSHOT;
}

function persistThemeValues(values: Partial<Record<ThemeStorageKey, string>>) {
  for (const key of THEME_STORAGE_KEYS) {
    const value = values[key];
    if (value !== undefined) localStorage.setItem(key, value);
  }
  window.dispatchEvent(new Event(THEME_STORAGE_EVENT));
}

function isAccentColor(value: string): value is AccentColor {
  return (
    value === 'orange' ||
    value === 'cyan' ||
    value === 'purple' ||
    value === 'emerald' ||
    value === 'rose' ||
    value === 'amber'
  );
}

function isColorMode(value: string): value is ColorMode {
  return value === 'light' || value === 'dark';
}

function parseThemeStorageSnapshot(snapshot: string) {
  const [storedMode, storedAccent, storedOpacity, storedColorMode, storedIntensity, storedSpeed, storedAccentSync] =
    snapshot.split('\u0000');
  const parsedOpacity = Number.parseInt(storedOpacity || '35', 10);

  return {
    mode: isThemeId(storedMode) ? storedMode : 'professional-matte',
    accent: isAccentColor(storedAccent) ? storedAccent : 'orange',
    glassOpacity: Number.isFinite(parsedOpacity) ? parsedOpacity : 35,
    colorMode: isColorMode(storedColorMode) ? storedColorMode : 'light',
    intensity: isIntensity(storedIntensity) ? storedIntensity : 'normal',
    speed: clampSpeed(Number.parseFloat(storedSpeed || '1')),
    accentSync: storedAccentSync !== 'off',
  } satisfies {
    mode: AnimationMode;
    accent: AccentColor;
    glassOpacity: number;
    colorMode: ColorMode;
    intensity: EngineIntensity;
    speed: number;
    accentSync: boolean;
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const storageSnapshot = useSyncExternalStore(
    subscribeToThemeStorage,
    getThemeStorageSnapshot,
    getServerThemeStorageSnapshot
  );
  const { mode, accent, glassOpacity, colorMode, intensity, speed, accentSync } = useMemo(
    () => parseThemeStorageSnapshot(storageSnapshot),
    [storageSnapshot]
  );

  useLayoutEffect(() => {
    applyThemeAttributes(mode, accent, glassOpacity, colorMode);
  }, [accent, colorMode, glassOpacity, mode]);

  const setMode = (newMode: AnimationMode) => {
    let nextAccent = accent;
    // Per-theme accent sync: adopting a theme also adopts its paired accent.
    const theme = getTheme(newMode);
    if (accentSync && (theme.engine === 'css' || theme.engine === 'canvas')) {
      nextAccent = theme.accent;
    }
    persistThemeValues({
      ras_theme_mode: newMode,
      ...(nextAccent !== accent ? { ras_theme_accent: nextAccent } : {}),
    });
    applyThemeAttributes(newMode, nextAccent, glassOpacity, colorMode);
  };

  const randomizeTheme = () => {
    setMode(randomThemeId(mode));
  };

  const setAccent = (newAccent: AccentColor) => {
    persistThemeValues({ ras_theme_accent: newAccent });
    applyThemeAttributes(mode, newAccent, glassOpacity, colorMode);
  };

  const setGlassOpacity = (newOpacity: number) => {
    persistThemeValues({ ras_theme_opacity: `${newOpacity}` });
    applyThemeAttributes(mode, accent, newOpacity, colorMode);
  };

  const setColorMode = (newColorMode: ColorMode) => {
    persistThemeValues({ ras_rbt_color_mode: newColorMode });
    applyThemeAttributes(mode, accent, glassOpacity, newColorMode);
  };

  const setIntensity = (newIntensity: EngineIntensity) => {
    persistThemeValues({ ras_theme_intensity: newIntensity });
  };

  const setSpeed = (newSpeed: number) => {
    const clamped = clampSpeed(newSpeed);
    persistThemeValues({ ras_theme_speed: `${clamped}` });
  };

  const setAccentSync = (sync: boolean) => {
    persistThemeValues({ ras_theme_accent_sync: sync ? 'on' : 'off' });
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
