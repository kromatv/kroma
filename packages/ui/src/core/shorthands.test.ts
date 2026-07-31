import { describe, expect, it } from 'vitest';
import { boxStyle, color } from '#ui/core';
import { colors, radius, shadow } from '#ui/core/tokens';

describe('boxStyle flex shorthands', () => {
  it('turns `flex` into flex: 1 but keeps an explicit factor', () => {
    expect(boxStyle({ flex: true })).toEqual({ flex: 1 });
    expect(boxStyle({ flex: 2 })).toEqual({ flex: 2 });
    expect(boxStyle({ flex: 0 })).toEqual({ flex: 0 });
  });

  it('centres both axes with `center`', () => {
    expect(boxStyle({ center: true })).toEqual({
      alignItems: 'center',
      justifyContent: 'center',
    });
  });

  it('lets an explicit align/justify win over the shorthands', () => {
    expect(boxStyle({ center: true, justify: 'flex-end' }).justifyContent).toBe('flex-end');
    expect(boxStyle({ between: true, justify: 'center' }).justifyContent).toBe('center');
  });

  it('emits nothing at all for an empty box', () => {
    expect(boxStyle({})).toEqual({});
  });
});

describe('boxStyle spacing', () => {
  it('expands `p` to all four longhands', () => {
    expect(boxStyle({ p: 16 })).toEqual({
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    });
  });

  it('lets an axis override the all-sides value, and a side override the axis', () => {
    expect(boxStyle({ p: 8, px: 24, pt: 40 })).toEqual({
      paddingTop: 40,
      paddingRight: 24,
      paddingBottom: 8,
      paddingLeft: 24,
    });
  });

  it('handles margins the same way, including zero', () => {
    expect(boxStyle({ my: 0 })).toEqual({ marginTop: 0, marginBottom: 0 });
  });
});

describe('boxStyle paint', () => {
  it('resolves a palette token but passes a raw colour through', () => {
    expect(boxStyle({ bg: 'accent' }).backgroundColor).toBe(colors.accent);
    expect(boxStyle({ bg: 'rgba(0,0,0,0.5)' }).backgroundColor).toBe('rgba(0,0,0,0.5)');
    expect(color('surface1')).toBe(colors.surface1);
  });

  it('resolves a radius token but passes a raw number through', () => {
    expect(boxStyle({ radius: 'lg' }).borderRadius).toBe(radius.lg);
    expect(boxStyle({ radius: 7 }).borderRadius).toBe(7);
  });

  it('defaults a border to 1px when only the colour is given', () => {
    expect(boxStyle({ border: 'border' })).toEqual({
      borderColor: colors.border,
      borderWidth: 1,
    });
    expect(boxStyle({ border: 'accent', borderWidth: 4 }).borderWidth).toBe(4);
    expect(boxStyle({ borderWidth: 2 })).toEqual({ borderWidth: 2 });
  });

  it('maps the elevation token to a boxShadow', () => {
    expect(boxStyle({ shadow: 'card' })).toEqual({ boxShadow: shadow.card });
  });
});

describe('boxStyle position', () => {
  it('stretches to the parent with `fill`', () => {
    expect(boxStyle({ fill: true })).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });

  it('lets explicit insets refine a fill', () => {
    expect(boxStyle({ fill: true, top: 24 }).top).toBe(24);
  });
});

describe('color() alpha syntax', () => {
  it("reads Tailwind's /NN as a percentage of opacity", () => {
    expect(color('white/12')).toBe('rgba(255, 255, 255, 0.12)');
    expect(color('white/20')).toBe('rgba(255, 255, 255, 0.2)');
    expect(color('black/50')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('applies it to palette tokens too', () => {
    // bg is #0A0A0C — the scrim wash the player already used, spelled once.
    expect(color('bg/55')).toBe('rgba(10, 10, 12, 0.55)');
    expect(color('accent/45')).toBe('rgba(244, 182, 66, 0.45)');
  });

  it('leaves a bare token and a raw colour alone', () => {
    expect(color('accent')).toBe('#F4B642');
    expect(color('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(color('#123456')).toBe('#123456');
  });

  it('does not mistake a CSS slash for an alpha', () => {
    expect(color('rgb(255 0 0 / 50%)')).toBe('rgb(255 0 0 / 50%)');
    expect(color('white/nope')).toBe('white/nope');
  });
});
