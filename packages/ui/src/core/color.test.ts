import { describe, expect, it } from 'vitest';
import { COLOR_KEYS, color, withAlpha } from './color';

describe('color', () => {
  it('resolves a palette token', () => {
    expect(color('accent')).toBe('var(--kroma-accent)');
    expect(color('surface1')).toBe('var(--kroma-surface-1)');
  });

  it('resolves white and black, which are not palette tokens', () => {
    expect(color('white')).toBe('#FFFFFF');
    expect(color('black')).toBe('#000000');
  });

  it('returns an unrecognised name verbatim', () => {
    expect(color('rebeccapurple')).toBe('rebeccapurple');
    expect(color('transparent')).toBe('transparent');
  });

  it('returns a raw CSS colour untouched', () => {
    expect(color('#123456')).toBe('#123456');
    expect(color('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(color('hsl(210, 82%, 62%)')).toBe('hsl(210, 82%, 62%)');
  });

  describe('/NN alpha suffix', () => {
    it('reads NN as a percentage', () => {
      expect(color('white/12')).toBe('rgba(255, 255, 255, 0.12)');
      expect(color('white/20')).toBe('rgba(255, 255, 255, 0.2)');
      expect(color('black/50')).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('applies to palette tokens', () => {
      expect(color('bg/55')).toBe('var(--kroma-bg-55)');
      expect(color('accent/45')).toBe('var(--kroma-accent-45)');
    });

    it('handles the extremes', () => {
      expect(color('white/0')).toBe('rgba(255, 255, 255, 0)');
      expect(color('white/100')).toBe('rgba(255, 255, 255, 1)');
    });

    it('keeps fractional percentages', () => {
      expect(color('white/2.5')).toBe('rgba(255, 255, 255, 0.025)');
    });

    it('does not mistake a CSS slash for an alpha', () => {
      expect(color('rgb(255 0 0 / 50%)')).toBe('rgb(255 0 0 / 50%)');
      expect(color('hsl(210 82% 62% / 40%)')).toBe('hsl(210 82% 62% / 40%)');
    });

    it('leaves a non-numeric suffix alone', () => {
      expect(color('white/nope')).toBe('white/nope');
      expect(color('white/')).toBe('white/');
    });

    it('leaves a base it cannot expand alone rather than guessing', () => {
      // `transparent` is not hex, so there is nothing to apply an alpha to.
      expect(color('transparent/50')).toBe('transparent');
    });
  });
});

describe('withAlpha', () => {
  it('expands three-digit hex', () => {
    expect(withAlpha('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)');
  });

  it('is case-insensitive', () => {
    expect(withAlpha('#FFF', 1)).toBe(withAlpha('#fff', 1));
  });

  it('returns a non-hex colour untouched', () => {
    expect(withAlpha('rgba(1, 2, 3, 1)', 0.5)).toBe('rgba(1, 2, 3, 1)');
    expect(withAlpha('currentColor', 0.5)).toBe('currentColor');
  });

  it('trims trailing zeros so the output matches the palette literals', () => {
    expect(withAlpha('#000000', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });
});

describe('COLOR_KEYS', () => {
  it('covers the props-slot key that motivated it', () => {
    // <Icon> takes `color`, which is not a shorthand, so without this entry a
    // recipe's colour vocabulary would work in `bg` and not in `color`.
    expect(COLOR_KEYS.has('color')).toBe(true);
  });

  it('covers the longhands a painted slot can be authored with', () => {
    for (const key of ['backgroundColor', 'borderColor', 'shadowColor', 'tintColor']) {
      expect(COLOR_KEYS.has(key)).toBe(true);
    }
  });

  it('does not claim keys whose value is not a colour', () => {
    for (const key of ['borderWidth', 'opacity', 'fontSize']) {
      expect(COLOR_KEYS.has(key)).toBe(false);
    }
  });
});
