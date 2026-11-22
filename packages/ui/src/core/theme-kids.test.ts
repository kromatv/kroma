import { describe, expect, it } from 'vitest';
import { blend, contrast } from '#ui/testing-contrast';
import type { Theme } from './theme';
import { KROMA_KIDS, KROMA_KIDS_LIGHT } from './theme-kids';
import { colors as night, lightColors as paper } from './tokens/colors';
import { radius } from './tokens/layout';

type Token = keyof typeof night;

const inkOf = (theme: Theme, base: Record<Token, string>) => (token: Token) => {
  const own = theme.colors[token];
  return own.startsWith('var(') ? base[token] : own;
};

const grounds = [
  ['night', inkOf(KROMA_KIDS, night)],
  ['paper', inkOf(KROMA_KIDS_LIGHT, paper)],
] as const;

describe.each(grounds)('the Kids theme on its %s ground', (_, ink) => {
  it('keeps body text readable on the page and on every raised surface', () => {
    for (const ground of [ink('bg'), ink('surface2'), ink('surface3')]) {
      expect(contrast(ink('text'), ground)).toBeGreaterThan(4.5);
    }
  });

  it('keeps a label readable on the accent fill, at rest, hovered and pressed', () => {
    for (const fill of [ink('accent'), ink('accentHover'), ink('accentPress')]) {
      expect(contrast(ink('accentInk'), fill)).toBeGreaterThan(4.5);
    }
  });

  it('keeps the accent ink readable on the page, raised, and on its own wash', () => {
    const wash = blend(ink('accentSoft'), ink('bg'));

    for (const ground of [ink('bg'), ink('surface2'), ink('surface3'), wash]) {
      expect(contrast(ink('accentText'), ground)).toBeGreaterThan(4.5);
    }
  });
});

describe('the Kids theme', () => {
  it('rounds every control and card further than KROMA does, on both grounds', () => {
    for (const token of ['control', 'panel', 'tile', 'row', 'dialog'] as const) {
      expect(KROMA_KIDS.radius[token]).toBeGreaterThan(radius[token]);
      expect(KROMA_KIDS_LIGHT.radius[token]).toBe(KROMA_KIDS.radius[token]);
    }
  });

  it('keeps the paper half on paper and the night half at night', () => {
    expect(inkOf(KROMA_KIDS_LIGHT, paper)('tint')).toBe(paper.tint);
    expect(inkOf(KROMA_KIDS, night)('tint')).toBe(night.tint);
  });
});
