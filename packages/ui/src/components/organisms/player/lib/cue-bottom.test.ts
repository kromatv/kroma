import { describe, expect, it } from 'vitest';
import { cueBottom } from './cue-bottom';

describe('cueBottom', () => {
  it('rests near the foot of the picture when no controls are up', () => {
    expect(cueBottom(0)).toBe('9%');
  });

  it('sits at the top of the controls when they are up', () => {
    expect(cueBottom(212)).toBe(212);
  });

  it('treats a negative clearance as no controls', () => {
    expect(cueBottom(-4)).toBe('9%');
  });
});
