import type { MatchCandidate } from '@kroma/core';
import type { ColorValue } from '@kroma/ui/kit';

/** At or above this the matcher agrees with the file on disk. */
export const STRONG_SCORE = 0.7;

/** At or above this a candidate is offered as a probable match rather than as a
 * long shot: it is also where the picker splits its two bands. */
export const LIKELY_SCORE = 0.35;

/** The matcher's 0..1 score as a whole percentage. */
export function confidencePercent(score: number): number {
  return Math.round(Math.min(Math.max(score, 0), 1) * 100);
}

/** The score's ink: solid, because it also paints the meter beside it. */
export function confidenceTone(score: number): ColorValue {
  if (score >= STRONG_SCORE) return 'success';
  if (score >= LIKELY_SCORE) return 'accent';
  return 'glyphDim';
}

export type CandidateBand = 'likely' | 'other';

export interface CandidateGroup {
  band: CandidateBand;
  items: MatchCandidate[];
}

function bandOf(candidate: MatchCandidate): CandidateBand {
  return candidate.current || candidate.score >= LIKELY_SCORE ? 'likely' : 'other';
}

function compare(a: MatchCandidate, b: MatchCandidate): number {
  if (a.current !== b.current) return a.current ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  return a.tmdbId - b.tmdbId;
}

/**
 * The candidates as the picker reads them: the pinned match first, then most
 * likely first, split into the probable matches and the long shots. A band that
 * holds nothing is dropped, so a search whose hits all score low comes back as
 * one ungrouped run.
 */
export function rankCandidates(results: readonly MatchCandidate[]): CandidateGroup[] {
  const sorted = [...results].sort(compare);
  const groups: CandidateGroup[] = [
    { band: 'likely', items: sorted.filter((c) => bandOf(c) === 'likely') },
    { band: 'other', items: sorted.filter((c) => bandOf(c) === 'other') },
  ];
  return groups.filter((group) => group.items.length > 0);
}
