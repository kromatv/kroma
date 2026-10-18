import type { ScoredReleaseView } from '@kromatv/client/requests';
import { describe, expect, it } from 'vitest';
import { autoPickOf, effectOf, groupByEffect } from './release-effect';

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

describe('autoPickOf', () => {
  it('picks the best scored release of the group that fills a gap', () => {
    const weaker: Judged = { score: 400, verdict: { kind: 'fill' } };

    const picked = autoPickOf(groupByEffect([weaker, improves, fills, refused]));

    expect(picked).toBe(fills);
  });

  it('picks nothing when no release fills a gap or improves a file', () => {
    const beside: Judged = { score: 900, verdict: { kind: 'beside', reason: 'formats' } };

    const picked = autoPickOf(groupByEffect([beside, refused]));

    expect(picked).toBeNull();
  });
});
