import type { MatchCandidate } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  confidencePercent,
  confidenceTone,
  LIKELY_SCORE,
  rankCandidates,
  STRONG_SCORE,
} from './rematch-ranking';

function candidate(over: Partial<MatchCandidate> & { tmdbId: number }): MatchCandidate {
  return {
    title: `title ${over.tmdbId}`,
    originalTitle: null,
    year: null,
    posterUrl: null,
    overview: null,
    rating: null,
    score: 0,
    current: false,
    ...over,
  };
}

describe('confidencePercent', () => {
  it('rounds a 0..1 score to whole percent', () => {
    expect(confidencePercent(0.856)).toBe(86);
    expect(confidencePercent(1)).toBe(100);
    expect(confidencePercent(0)).toBe(0);
  });

  it('clamps anything outside the range', () => {
    expect(confidencePercent(-0.4)).toBe(0);
    expect(confidencePercent(1.5)).toBe(100);
  });
});

describe('confidenceTone', () => {
  it('paints the three bands apart', () => {
    expect(confidenceTone(STRONG_SCORE)).toBe('success');
    expect(confidenceTone(LIKELY_SCORE)).toBe('accent');
    expect(confidenceTone(LIKELY_SCORE - 0.01)).toBe('glyphDim');
  });
});

describe('rankCandidates', () => {
  it('has nothing to say about no candidates', () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it('splits the probable matches from the long shots', () => {
    const groups = rankCandidates([
      candidate({ tmdbId: 1, score: 0.9 }),
      candidate({ tmdbId: 2, score: 0.1 }),
      candidate({ tmdbId: 3, score: LIKELY_SCORE }),
    ]);
    expect(groups.map((g) => g.band)).toEqual(['likely', 'other']);
    expect(groups[0]?.items.map((c) => c.tmdbId)).toEqual([1, 3]);
    expect(groups[1]?.items.map((c) => c.tmdbId)).toEqual([2]);
  });

  it('keeps one ungrouped run when every hit scores low', () => {
    const groups = rankCandidates([
      candidate({ tmdbId: 1, score: 0.2 }),
      candidate({ tmdbId: 2, score: 0.1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.band).toBe('other');
  });

  it('keeps one ungrouped run when every hit scores high', () => {
    const groups = rankCandidates([candidate({ tmdbId: 1, score: 0.9 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.band).toBe('likely');
  });

  it('offers the current match first, and among the probable ones however it scores', () => {
    const groups = rankCandidates([
      candidate({ tmdbId: 1, score: 0.9 }),
      candidate({ tmdbId: 2, score: 0.05, current: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((c) => c.tmdbId)).toEqual([2, 1]);
  });

  it('keeps the current match first when the server already listed it first', () => {
    const groups = rankCandidates([
      candidate({ tmdbId: 2, score: 0.05, current: true }),
      candidate({ tmdbId: 1, score: 0.9 }),
    ]);
    expect(groups[0]?.items.map((c) => c.tmdbId)).toEqual([2, 1]);
  });

  it('breaks a tied score on the tmdb id rather than on the order it was given', () => {
    const groups = rankCandidates([
      candidate({ tmdbId: 9, score: 0.8 }),
      candidate({ tmdbId: 4, score: 0.8 }),
    ]);
    expect(groups[0]?.items.map((c) => c.tmdbId)).toEqual([4, 9]);
  });

  it('leaves the list it was given alone', () => {
    const results = [candidate({ tmdbId: 1, score: 0.1 }), candidate({ tmdbId: 2, score: 0.9 })];
    rankCandidates(results);
    expect(results.map((c) => c.tmdbId)).toEqual([1, 2]);
  });
});
