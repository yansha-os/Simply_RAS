import { describe, expect, it } from 'vitest';
import {
  ANIMATED_THEME_IDS,
  clampSpeed,
  getTheme,
  isIntensity,
  isThemeId,
  randomThemeId,
  THEMES,
} from '@/components/theme/themeRegistry';
import { RENDERERS } from '@/components/theme/canvasRenderers';

describe('theme registry', () => {
  it('has unique theme ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships at least 10 animated engine themes', () => {
    expect(ANIMATED_THEME_IDS.length).toBeGreaterThanOrEqual(10);
  });

  it('every css theme declares its layer count', () => {
    for (const t of THEMES.filter((t) => t.engine === 'css')) {
      expect(t.cssLayers, `theme ${t.id} missing cssLayers`).toBeGreaterThan(0);
    }
  });

  it('every canvas theme has a registered renderer', () => {
    for (const t of THEMES.filter((t) => t.engine === 'canvas')) {
      expect(t.canvas, `theme ${t.id} missing canvas kind`).toBeTruthy();
      expect(RENDERERS[t.canvas!], `no renderer for ${t.canvas}`).toBeDefined();
      expect(typeof RENDERERS[t.canvas!].init).toBe('function');
      expect(typeof RENDERERS[t.canvas!].frame).toBe('function');
    }
  });

  it('every theme has a base color and reduced-motion static fallback', () => {
    for (const t of THEMES) {
      expect(t.baseColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.staticBackground.length).toBeGreaterThan(0);
    }
  });

  it('getTheme falls back to the default for unknown ids', () => {
    expect(getTheme('does-not-exist').id).toBe(THEMES[0].id);
    expect(getTheme('aurora-borealis').id).toBe('aurora-borealis');
  });

  it('isThemeId validates stored localStorage values', () => {
    expect(isThemeId('code-rain')).toBe(true);
    expect(isThemeId('professional-matte')).toBe(true);
    expect(isThemeId('garbage')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('randomThemeId never returns the excluded theme and only animated themes', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomThemeId('starfield');
      expect(id).not.toBe('starfield');
      expect(ANIMATED_THEME_IDS).toContain(id);
    }
  });

  it('clampSpeed keeps speed within engine bounds', () => {
    expect(clampSpeed(0)).toBe(0.5);
    expect(clampSpeed(10)).toBe(2);
    expect(clampSpeed(1.25)).toBe(1.25);
    expect(clampSpeed(NaN)).toBe(1);
  });

  it('isIntensity validates stored intensity values', () => {
    expect(isIntensity('subtle')).toBe(true);
    expect(isIntensity('vivid')).toBe(true);
    expect(isIntensity('extreme')).toBe(false);
  });
});
