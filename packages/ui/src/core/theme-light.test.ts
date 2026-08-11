import { describe, expect, it } from 'vitest';
import { color } from './color';
import { KROMA, KROMA_LIGHT, setTheme } from './theme';
import { colors, lightColors } from './tokens/colors';

const luminance = (hex: string): number => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(m.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe('the light palette', () => {
  it('covers every token the dark one declares', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(colors).sort());
  });

  it('flips the wash direction', () => {
    expect(colors.tint).toBe('#FFFFFF');
    expect(lightColors.tint).toBe('#0A0A0C');
  });

  it('keeps body text readable on the page ground', () => {
    expect(contrast(lightColors.text, lightColors.bg)).toBeGreaterThan(4.5);
    expect(contrast(colors.text, colors.bg)).toBeGreaterThan(4.5);
  });

  it('keeps the accent usable as a fill and, separately, as ink', () => {
    expect(contrast(lightColors.accentInk, lightColors.accent)).toBeGreaterThan(4.5);
    expect(contrast(lightColors.accentText, lightColors.bg)).toBeGreaterThan(4.5);
    expect(contrast(colors.accentInk, colors.accent)).toBeGreaterThan(4.5);
    expect(contrast(colors.accentText, colors.bg)).toBeGreaterThan(4.5);
  });
});

describe('switching themes', () => {
  it('re-resolves a token through the active palette', () => {
    setTheme(KROMA);
    expect(color('bg')).toBe('var(--kroma-bg)');
    setTheme(KROMA_LIGHT);
    expect(color('bg')).toBe(lightColors.bg);
    setTheme(KROMA);
  });

  it('re-resolves an alpha wash in the new direction', () => {
    setTheme(KROMA);
    expect(color('tint/8')).toBe('var(--kroma-tint-8)');
    setTheme(KROMA_LIGHT);
    expect(color('tint/8')).toBe('rgba(10, 10, 12, 0.08)');
    setTheme(KROMA);
  });
});
