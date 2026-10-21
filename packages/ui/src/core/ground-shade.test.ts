import { describe, expect, it } from 'vitest';

import { groundShade, onPaper } from './ground-shade';
import { KROMA, KROMA_LIGHT } from './theme-create';
import { withAlpha } from './tokens/colors';
import { CSS_COLORS } from './tokens/css-palette';

describe('groundShade', () => {
  it('fades the ground colour of the default theme', () => {
    expect(groundShade(0.4)).toBe(withAlpha(KROMA.colors.bg, 0.4));
  });

  it('fades the ground colour of the theme it is handed', () => {
    expect(groundShade(0.6, KROMA_LIGHT)).toBe(withAlpha(KROMA_LIGHT.colors.bg, 0.6));
  });
});

describe('onPaper', () => {
  it('is false on the dark default theme', () => {
    expect(onPaper()).toBe(false);
  });

  it('is true on the light theme only where no cascade repaints it', () => {
    expect(onPaper(KROMA_LIGHT)).toBe(!CSS_COLORS);
  });
});
