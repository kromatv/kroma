import { describe, expect, it } from 'vitest';
import { normalize, split, stabilise } from './normalize';

describe('normalize', () => {
  it('expands shorthands into React Native longhands', () => {
    expect(normalize({ row: true, center: true, px: 18, radius: 'pill' })).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 18,
      paddingRight: 18,
      borderRadius: 999,
    });
  });

  it('expands an edge shorthand into all four sides, so a later layer can beat it', () => {
    expect(normalize({ p: 12 })).toEqual({
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12,
    });
  });

  it('lets the most specific edge win within one layer', () => {
    expect(normalize({ p: 20, pt: 4 })).toMatchObject({ paddingTop: 4, paddingBottom: 20 });
  });

  it('passes a key it does not own straight through', () => {
    expect(normalize({ fontSize: 15, letterSpacing: 0.2 })).toEqual({
      fontSize: 15,
      letterSpacing: 0.2,
    });
  });

  it('resolves colours behind a shorthand', () => {
    expect(normalize({ bg: 'accent' })).toEqual({ backgroundColor: 'var(--kroma-accent)' });
    expect(normalize({ bg: 'white/12' })).toEqual({
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    });
  });

  it('resolves colours behind a longhand, which is what a props slot writes', () => {
    expect(normalize({ color: 'accent' })).toEqual({ color: 'var(--kroma-accent)' });
    expect(normalize({ color: 'white/50' })).toEqual({ color: 'rgba(255, 255, 255, 0.5)' });
    expect(normalize({ shadowColor: 'bg' })).toEqual({ shadowColor: 'var(--kroma-bg)' });
  });

  it('leaves a non-string colour value alone', () => {
    expect(normalize({ color: undefined })).toEqual({ color: undefined });
  });

  it('lets a longhand beat the shorthand it stands for, within one layer', () => {
    expect(normalize({ bg: 'accent', backgroundColor: '#123456' })).toEqual({
      backgroundColor: '#123456',
    });
  });

  it('returns an empty object for an empty layer', () => {
    expect(normalize({})).toEqual({});
  });
});

describe('split', () => {
  it('is undefined for a missing declaration', () => {
    expect(split(undefined)).toBeUndefined();
  });

  it('separates the rest value from the per-state layers', () => {
    const s = split({ bg: 'accent', _hover: { bg: 'accentHover' } });
    expect(s?.rest).toEqual({ backgroundColor: 'var(--kroma-accent)' });
    expect(s?.states.hover).toEqual({ backgroundColor: 'var(--kroma-accent-hover)' });
  });

  it('normalises the state layers too', () => {
    expect(split({ _press: { px: 4 } })?.states.press).toEqual({
      paddingLeft: 4,
      paddingRight: 4,
    });
  });

  it('reports which states it declared, so the compiler can mask the rest', () => {
    expect(split({ bg: 'accent' })?.declared).toEqual([]);
    expect(split({ _hover: {}, _disabled: {} })?.declared).toEqual(['hover', 'disabled']);
  });

  it('rejects an unknown state rather than emitting it as a style key', () => {
    expect(() => split({ _active: { bg: 'accent' } })).toThrow(/unknown state "_active"/);
  });

  it('names the states it does accept, so the error is actionable', () => {
    expect(() => split({ _pressed: {} })).toThrow(/_hover/);
  });
});

describe('stabilise', () => {
  it('sorts keys so the same styles always serialise identically', () => {
    const a = stabilise({ zIndex: 1, backgroundColor: 'red', opacity: 0.5 });
    const b = stabilise({ opacity: 0.5, zIndex: 1, backgroundColor: 'red' });
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('freezes the result, so a caller cannot poison a cached combination', () => {
    expect(Object.isFrozen(stabilise({ opacity: 1 }))).toBe(true);
  });

  it('preserves values, including undefined ones', () => {
    expect(stabilise({ a: 1, b: undefined })).toEqual({ a: 1, b: undefined });
  });
});

describe('stabilise ordering', () => {
  it("puts React Native's own shorthands before the longhands they lose to", () => {
    // RN resolves `{ paddingVertical, paddingTop }` by declaration order, so a
    // plain alphabetical sort would hand the win to the less specific key.
    const keys = Object.keys(stabilise({ paddingTop: 4, paddingVertical: 20, zIndex: 1 }));
    expect(keys.indexOf('paddingVertical')).toBeLessThan(keys.indexOf('paddingTop'));
  });

  it('still orders the rest alphabetically, so the output stays stable', () => {
    expect(Object.keys(stabilise({ zIndex: 1, opacity: 0.5, borderRadius: 4 }))).toEqual([
      'borderRadius',
      'opacity',
      'zIndex',
    ]);
  });
});
