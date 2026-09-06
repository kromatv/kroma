import { describe, expect, it } from 'vitest';
import { isStaticStyle, markStatic, staticStates } from './static-style';

describe('static style shape', () => {
  it('is any style carrying the mark', () => {
    const style = { opacity: 0.5 };
    markStatic(style);

    expect(isStaticStyle(style)).toBe(true);
    expect(isStaticStyle({ opacity: 0.5 })).toBe(false);
    expect(isStaticStyle(null)).toBe(false);
  });

  it('keeps the mark and the states out of sight of a key walk', () => {
    const hover = { opacity: 1 };
    markStatic(hover);
    const style = { opacity: 0.5 };
    markStatic(style, { hover });

    expect(Object.keys(style)).toEqual(['opacity']);
    expect({ ...style }).toEqual({ opacity: 0.5 });
    expect(JSON.stringify(style)).toBe('{"opacity":0.5}');
    expect(staticStates(style)).toEqual({ hover });
    expect(staticStates({ opacity: 1 })).toEqual({});
  });
});
