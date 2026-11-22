import { describe, expect, it } from 'vitest';
import { blend, contrast } from '#ui/testing-contrast';
import { createStyleTestHost } from '#ui/testing-style';

import { KROMA, KROMA_LIGHT } from './theme';
import { colors, lightColors } from './tokens/colors';

const styleHost = createStyleTestHost();
const { color, setTheme } = styleHost;

const weakestOnDanger = (palette: Record<keyof typeof colors, string>): number =>
  Math.min(
    ...[palette.danger, palette.dangerHover, palette.dangerPress].map((fill) =>
      contrast(palette.dangerInk, fill),
    ),
  );

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

  it('keeps the ink readable on paper it is raised above, and on its own wash', () => {
    const wash = blend(lightColors.accentSoft, lightColors.bg);

    expect(contrast(lightColors.accentText, lightColors.surface2)).toBeGreaterThan(4.5);
    expect(contrast(lightColors.accentText, lightColors.surface3)).toBeGreaterThan(4.5);
    expect(contrast(lightColors.accentText, wash)).toBeGreaterThan(4.5);
  });

  it('keeps the accent usable as a fill and, separately, as ink', () => {
    expect(contrast(lightColors.accentInk, lightColors.accent)).toBeGreaterThan(4.5);
    expect(contrast(lightColors.accentText, lightColors.bg)).toBeGreaterThan(4.5);
    expect(contrast(colors.accentInk, colors.accent)).toBeGreaterThan(4.5);
    expect(contrast(colors.accentText, colors.bg)).toBeGreaterThan(4.5);
  });

  it('keeps a label readable on the danger fill, at rest, hovered and pressed', () => {
    expect(weakestOnDanger(lightColors)).toBeGreaterThan(4.5);
    expect(weakestOnDanger(colors)).toBeGreaterThan(4.5);
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
