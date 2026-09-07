import { describe, expect, it } from 'vitest';
import {
  ANIMATED_THEME_IDS,
  clampSpeed,
  getTheme,
  isIntensity,
  isThemeId,
  THEMES,
} from '@/components/theme/themeRegistry';
import { RENDERERS } from '@/components/theme/canvasRenderers';
import { playClickSound } from '@/components/theme/audioSynth';

describe('crm theme registry 2.0', () => {
  it('has unique theme ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships at least 20 animated engine themes', () => {
    expect(ANIMATED_THEME_IDS.length).toBeGreaterThanOrEqual(20);
  });

  it('every canvas theme has a registered renderer', () => {
    for (const t of THEMES.filter((t) => t.engine === 'canvas')) {
      expect(t.canvas, `theme ${t.id} missing canvas kind`).toBeTruthy();
      expect(RENDERERS[t.canvas!], `no renderer for ${t.canvas}`).toBeDefined();
      expect(typeof RENDERERS[t.canvas!].init).toBe('function');
      expect(typeof RENDERERS[t.canvas!].frame).toBe('function');
    }
  });

  it('every theme has a valid base color and static fallback', () => {
    for (const t of THEMES) {
      expect(t.baseColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.staticBackground.length).toBeGreaterThan(0);
      expect(t.category).toBeDefined();
    }
  });

  it('getTheme falls back to the default for unknown ids', () => {
    expect(getTheme('does-not-exist').id).toBe(THEMES[0].id);
    expect(getTheme('quantum-flux').id).toBe('quantum-flux');
    expect(getTheme('fractal-mandala').id).toBe('fractal-mandala');
    expect(getTheme('black-hole-singularity').id).toBe('black-hole-singularity');
  });

  it('isThemeId validates stored localStorage values', () => {
    expect(isThemeId('quantum-flux')).toBe(true);
    expect(isThemeId('cyber-hologram')).toBe(true);
    expect(isThemeId('synthwave-highway')).toBe(true);
    expect(isThemeId('invalid-theme')).toBe(false);
  });

  it('clampSpeed keeps speed within engine bounds', () => {
    expect(clampSpeed(0)).toBe(0.25);
    expect(clampSpeed(10)).toBe(3.0);
    expect(clampSpeed(1.25)).toBe(1.25);
    expect(clampSpeed(NaN)).toBe(1);
  });

  it('isIntensity validates stored intensity values', () => {
    expect(isIntensity('subtle')).toBe(true);
    expect(isIntensity('normal')).toBe(true);
    expect(isIntensity('vivid')).toBe(true);
    expect(isIntensity('ultra')).toBe(true);
    expect(isIntensity('extreme')).toBe(false);
  });

  it('playClickSound safely handles muted and node environment without crashing', () => {
    expect(() => playClickSound('none', 0.5)).not.toThrow();
    expect(() => playClickSound('subtle-click', 0)).not.toThrow();
    expect(() => playClickSound('sci-fi-blip', 0.8)).not.toThrow();
  });
});
