import type { ScoredReleaseView } from '@kromatv/client/requests';
import { describe, expect, it } from 'vitest';
import { effectOf, groupByEffect } from './release-effect';

type Judged = Pick<ScoredReleaseView, 'score' | 'verdict'>;

const refused: Judged = { score: null, verdict: null };
const fills: Judged = { score: 900, verdict: { kind: 'fill' } };
const improves: Judged = { score: 400, verdict: { kind: 'upgrade', reason: 'quality' } };

describe('groupByEffect', () => {
  it('puts what fills a gap first and what a rule refused last', () => {
    const groups = groupByEffect([refused, improves, fills]);

    expect(groups.map((group) => group.effect)).toEqual(['fill', 'upgrade', 'refused']);
  });

  it('calls an accepted release with no verdict nothing better', () => {
    expect(effectOf({ score: 0, verdict: null })).toBe('notBetter');
  });
});
