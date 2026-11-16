import { describe, expect, it } from 'vitest';
import { completion } from './completion';

describe('completion', () => {
  it('counts a language that owes nothing as complete', () => {
    expect(completion({ done: 0, total: 0 })).toEqual({ ratio: 1, percent: 100, complete: true });
  });

  it('never rounds an unfinished language up to 100%', () => {
    expect(completion({ done: 199, total: 200 })).toMatchObject({ percent: 99, complete: false });
  });

  it('gives the share of messages already translated', () => {
    expect(completion({ done: 3, total: 4 })).toEqual({
      ratio: 0.75,
      percent: 75,
      complete: false,
    });
  });
});
