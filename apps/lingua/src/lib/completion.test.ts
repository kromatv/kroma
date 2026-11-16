import { describe, expect, it } from 'vitest';
import { completion, grouped, progressTone, workSummary } from './completion';

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

describe('progressTone', () => {
  it('reads complete, partial, or draft for an unfinished language no one is offered yet', () => {
    expect(progressTone({ done: 4, total: 4 }, 'draft')).toBe('complete');
    expect(progressTone({ done: 3, total: 4 })).toBe('partial');
    expect(progressTone({ done: 3, total: 4 }, 'beta')).toBe('partial');
    expect(progressTone({ done: 0, total: 4 }, 'draft')).toBe('draft');
  });
});

describe('grouped', () => {
  it('groups thousands', () => {
    expect(grouped(12345)).toBe('12,345');
  });
});

describe('workSummary', () => {
  it('says what is left, and nothing once all is done', () => {
    expect(workSummary({ missing: 3, translated: 9, outdated: 0, unreviewed: 1200 })).toBe(
      '3 missing · 1,200 unreviewed',
    );
    expect(workSummary({ missing: 0, translated: 9, outdated: 0, unreviewed: 0 })).toBeNull();
  });
});
