import { describe, expect, it } from 'vitest';
import { glideDuration, tweenAt } from './tween';

const linear = (t: number) => t;

describe('tweenAt', () => {
  it('eases between the ends and arrives at the duration', () => {
    const tween = { from: 0, to: 100, start: 0, duration: 200 };

    expect(tweenAt(tween, 100, linear)).toEqual({ value: 50, done: false });
    expect(tweenAt(tween, 250, linear)).toEqual({ value: 100, done: true });
  });

  it('holds the start for a frame stamped before it began', () => {
    expect(tweenAt({ from: 4, to: 8, start: 10, duration: 100 }, 5, linear).value).toBe(4);
  });
});

describe('glideDuration', () => {
  it('stays within its bounds', () => {
    expect(glideDuration(0)).toBe(250);
    expect(glideDuration(-5000)).toBe(450);
  });
});
