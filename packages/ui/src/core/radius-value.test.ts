import { describe, expect, it } from 'vitest';

import { radiusValue, scaledRadius } from './radius-value';
import { KROMA } from './theme-create';
import { CIRCLE_RADIUS } from './tokens/layout';

describe('radiusValue', () => {
  it('returns a number corner as it is', () => {
    expect(radiusValue(12)).toBe(12);
  });

  it('makes a circle as round as the default when no side is known', () => {
    expect(radiusValue('circle')).toBe(CIRCLE_RADIUS);
  });

  it('makes a circle half the side it is measured on', () => {
    expect(radiusValue('circle', 48)).toBe(24);
  });

  it('resolves a token against the theme', () => {
    expect(radiusValue('md')).toBe(KROMA.radius.md);
  });

  it('passes a string that is no token through', () => {
    expect(radiusValue('50%' as never)).toBe('50%');
  });
});

describe('scaledRadius', () => {
  it('rounds a numeric radius after scaling', () => {
    expect(scaledRadius(10, 1.5)).toBe(15);
    expect(scaledRadius(5, 0.5)).toBe(3);
  });

  it('keeps a string radius whole at factor one', () => {
    expect(scaledRadius('50%' as never, 1)).toBe('50%');
  });

  it('scales a string radius with calc', () => {
    expect(scaledRadius('50%' as never, 2)).toBe('calc(50% * 2)');
  });
});
