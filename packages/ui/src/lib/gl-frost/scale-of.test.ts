import { describe, expect, it } from 'vitest';
import { scaleOf } from './scale-of';

describe('scaleOf', () => {
  it('reads the scale of a computed matrix', () => {
    expect(scaleOf('matrix(1.04, 0, 0, 1.04, 0, 0)')).toBe(1.04);
  });

  it('is 1 for no transform', () => {
    expect(scaleOf('none')).toBe(1);
  });
});
