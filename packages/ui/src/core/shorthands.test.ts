import { afterEach, describe, expect, it } from 'vitest';
import {
  boxStyle,
  color,
  createTheme,
  KROMA,
  setTheme,
  splitShorthand,
  TEXT_STYLE_PROPS,
} from '#ui/core';
import { CIRCLE_RADIUS, radius } from '#ui/core/tokens';

afterEach(() => setTheme(KROMA));

describe('boxStyle flex shorthands', () => {
  it('turns `flex` into flex: 1 but keeps an explicit factor', () => {
    expect(boxStyle({ flex: true }, 0)).toEqual({ flex: 1 });
    expect(boxStyle({ flex: 2 }, 0)).toEqual({ flex: 2 });
    expect(boxStyle({ flex: 0 }, 0)).toEqual({ flex: 0 });
  });

  it('centres both axes with `center`', () => {
    expect(boxStyle({ center: true }, 0)).toEqual({
      alignItems: 'center',
      justifyContent: 'center',
    });
  });

  it('lets an explicit align/justify win over the shorthands', () => {
    expect(boxStyle({ center: true, justify: 'flex-end' }, 0).justifyContent).toBe('flex-end');
    expect(boxStyle({ between: true, justify: 'center' }, 0).justifyContent).toBe('center');
  });

  it('emits nothing at all for an empty box', () => {
    expect(boxStyle({}, 0)).toEqual({});
  });
});

describe('boxStyle spacing', () => {
  it('expands `p` to all four longhands', () => {
    expect(boxStyle({ p: 16 }, 0)).toEqual({
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    });
  });

  it('lets an axis override the all-sides value, and a side override the axis', () => {
    expect(boxStyle({ p: 8, px: 24, pt: 40 }, 0)).toEqual({
      paddingTop: 40,
      paddingRight: 24,
      paddingBottom: 8,
      paddingLeft: 24,
    });
  });

  it('handles margins the same way, including zero', () => {
    expect(boxStyle({ my: 0 }, 0)).toEqual({ marginTop: 0, marginBottom: 0 });
  });
});

describe('boxStyle paint', () => {
  it('resolves a palette token but passes a raw colour through', () => {
    expect(boxStyle({ bg: 'accent' }, 0).backgroundColor).toBe('var(--kroma-accent)');
    expect(boxStyle({ bg: 'rgba(0,0,0,0.5)' }, 0).backgroundColor).toBe('rgba(0,0,0,0.5)');
    expect(color('surface1')).toBe('var(--kroma-surface-1)');
  });

  it('resolves a radius token but passes a raw number through', () => {
    expect(boxStyle({ radius: 'lg' }, 0).borderRadius).toBe(radius.lg);
    expect(boxStyle({ radius: 7 }, 0).borderRadius).toBe(7);
  });

  it('takes `circle` from the box\u2019s own side, and clamps without one', () => {
    expect(boxStyle({ radius: 'circle', w: 40, h: 40 }, 0).borderRadius).toBe(20);
    // Height wins: a disc is measured on the side a capsule would cap.
    expect(boxStyle({ radius: 'circle', w: 80, h: 24 }, 0).borderRadius).toBe(12);
    expect(boxStyle({ radius: 'circle', w: '100%' }, 0).borderRadius).toBe(CIRCLE_RADIUS);
    expect(boxStyle({ radius: 'circle' }, 0).borderRadius).toBe(CIRCLE_RADIUS);
  });

  it('keeps a circle round under a theme that squares every corner', () => {
    setTheme(createTheme({ radius: { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, '2xl': 0, pill: 0 } }));
    expect(boxStyle({ radius: 'pill', w: 40, h: 40 }, 0).borderRadius).toBe(0);
    expect(boxStyle({ radius: 'circle', w: 40, h: 40 }, 0).borderRadius).toBe(20);
  });

  it('defaults a border to 1px when only the colour is given', () => {
    expect(boxStyle({ border: 'border' }, 0)).toEqual({
      borderColor: 'var(--kroma-border)',
      borderWidth: 1,
    });
    expect(boxStyle({ border: 'accent', borderWidth: 4 }, 0).borderWidth).toBe(4);
    expect(boxStyle({ borderWidth: 2 }, 0)).toEqual({ borderWidth: 2 });
  });

  it('maps the elevation token to a boxShadow', () => {
    expect(boxStyle({ shadow: 'card' }, 0)).toEqual({ boxShadow: 'var(--shadow-card)' });
  });
});

describe('boxStyle position', () => {
  it('stretches to the parent with `fill`', () => {
    expect(boxStyle({ fill: true }, 0)).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });

  it('lets explicit insets refine a fill', () => {
    expect(boxStyle({ fill: true, top: 24 }, 0).top).toBe(24);
  });
});

describe('the text half of the vocabulary', () => {
  it('claims the layout rows and leaves the container rows to <Box>', () => {
    const { shorthand, rest } = splitShorthand(
      { mt: 24, maxW: 640, textAlign: 'center', row: true, bg: 'accent', onPress: 1 },
      TEXT_STYLE_PROPS,
    );
    expect(shorthand).toEqual({ mt: 24, maxW: 640, textAlign: 'center' });
    expect(rest).toEqual({ row: true, bg: 'accent', onPress: 1 });
  });

  it('resolves through the same table <Box> reads', () => {
    expect(boxStyle({ textAlign: 'center' } as never, 0)).toEqual({ textAlign: 'center' });
    expect(boxStyle({ isolate: true }, 0)).toEqual({ isolation: 'isolate' });
    expect(boxStyle({ isolate: false }, 0)).toEqual({});
  });
});

describe('splitShorthand keys', () => {
  it('answers the same key whatever order the props were written in', () => {
    expect(splitShorthand({ row: true, gap: 4 }).key).toBe(
      splitShorthand({ gap: 4, row: true }).key,
    );
  });

  it('answers an empty key when nothing needs resolving', () => {
    expect(splitShorthand({ onLayout: 1 }).key).toBe('');
    expect(splitShorthand({ gap: undefined }).key).toBe('');
  });
});

describe('color() alpha syntax', () => {
  it("reads Tailwind's /NN as a percentage of opacity", () => {
    expect(color('white/12')).toBe('rgba(255, 255, 255, 0.12)');
    expect(color('white/20')).toBe('rgba(255, 255, 255, 0.2)');
    expect(color('black/50')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('applies it to palette tokens too', () => {
    // bg is #0A0A0C: the scrim wash the player already used, spelled once.
    expect(color('bg/55')).toBe('var(--kroma-bg-55)');
    expect(color('accent/45')).toBe('var(--kroma-accent-45)');
  });

  it('leaves a bare token and a raw colour alone', () => {
    expect(color('accent')).toBe('var(--kroma-accent)');
    expect(color('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(color('#123456')).toBe('#123456');
  });

  it('does not mistake a CSS slash for an alpha', () => {
    expect(color('rgb(255 0 0 / 50%)')).toBe('rgb(255 0 0 / 50%)');
    expect(color('white/nope')).toBe('white/nope');
  });
});

// <Focusable> has its own boolean `ring` prop, and a bag of style props is
// spread through the same path. Without the guard, `ring={false}` (or `ring`
// meaning "yes, draw yours") would be looked up as a token name and paint
// `undefined` into the style.
describe('the ring shorthand', () => {
  it('paints the named ring', () => {
    expect(Object.keys(boxStyle({ ring: 'focus' }, 0)).length).toBeGreaterThan(0);
  });

  it.each([
    ['false', false],
    ['true', true],
  ])('paints nothing for a boolean ring (%s)', (_label, value) => {
    expect(boxStyle({ ring: value as never }, 0)).toEqual({});
  });
});
