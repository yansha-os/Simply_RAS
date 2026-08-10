'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type AnimationMode = 'professional-matte' | 'cosmic-stars' | 'liquid-aurora' | 'cyberpunk-grid';
export type AccentColor = 'orange' | 'cyan' | 'purple' | 'emerald' | 'rose' | 'amber';
export type ColorMode = 'light' | 'dark';

interface ThemeContextType {
  mode: AnimationMode;
  setMode: (mode: AnimationMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  glassOpacity: number;
  setGlassOpacity: (opacity: number) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AnimationMode>('professional-matte');
  const [accent, setAccentState] = useState<AccentColor>('orange');
  const [glassOpacity, setGlassOpacityState] = useState<number>(35);
  const [colorMode, setColorModeState] = useState<ColorMode>('light');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const savedMode = (localStorage.getItem('ras_theme_mode') as AnimationMode) || 'professional-matte';
    const savedAccent = (localStorage.getItem('ras_theme_accent') as AccentColor) || 'orange';
    const savedOpacity = parseInt(localStorage.getItem('ras_theme_opacity') || '35', 10);
    // RBT default is ALWAYS 'light' mode unless explicitly saved as 'dark' in settings
    const savedColorMode = (localStorage.getItem('ras_rbt_color_mode') as ColorMode) || 'light';

    setModeState(savedMode);
    setAccentState(savedAccent);
    setGlassOpacityState(savedOpacity);
    setColorModeState(savedColorMode);

    applyThemeAttributes(savedMode, savedAccent, savedOpacity, savedColorMode);
  }, []);

  const applyThemeAttributes = (m: AnimationMode, a: AccentColor, o: number, c: ColorMode) => {
    document.documentElement.setAttribute('data-mode', m);
    document.documentElement.setAttribute('data-accent', a);
    document.documentElement.setAttribute('data-color-mode', c);
    document.documentElement.style.setProperty('--glass-opacity', `${o / 100}`);
  };

  const setMode = (newMode: AnimationMode) => {
    setModeState(newMode);
    localStorage.setItem('ras_theme_mode', newMode);
    applyThemeAttributes(newMode, accent, glassOpacity, colorMode);
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
        isSettingsOpen,
        setIsSettingsOpen,
      }}
    >
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
