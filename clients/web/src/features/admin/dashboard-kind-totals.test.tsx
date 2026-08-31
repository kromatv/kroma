import { describe, expect, it } from 'vitest';
import { dominantKind, kindTotals } from './dashboard-kind-totals';

describe('kindTotals', () => {
  it('reads every kind from the breakdown the server sent', () => {
    const totals = kindTotals({ movie: 10, tv: 20 }, 1, 2);

    expect(totals).toEqual({ movie: 10, tv: 20 });
  });

  it('falls back to the flat pair a server without a breakdown answers with', () => {
    const totals = kindTotals(null, 1, 2);

    expect(totals).toEqual({ movie: 1, tv: 2 });
  });

  it('keeps a kind the breakdown reports as zero rather than filling it in', () => {
    const totals = kindTotals({ movie: 0, tv: 0 }, 900, 900);

    expect(totals.movie).toBe(0);
  });
});

describe('dominantKind', () => {
  it('names the kind the account spent most of its time on', () => {
    expect(dominantKind({ movie: 10, tv: 90 })).toBe('tv');
  });

  it('names no kind at all where nothing was watched', () => {
    expect(dominantKind({ movie: 0, tv: 0 })).toBeNull();
  });
});
