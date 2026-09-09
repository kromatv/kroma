import { describe, expect, it } from 'vitest';
import { nestedRadius } from './layout';

describe('nestedRadius', () => {
  it('subtracts the inset from a number and never goes below zero', () => {
    expect(nestedRadius(13, 4)).toBe(9);
    expect(nestedRadius(2, 4)).toBe(0);
  });

  it('derives from a custom property with calc', () => {
    expect(nestedRadius('var(--radius-lg)', 4)).toBe('calc(var(--radius-lg) - 4px)');
  });
});
