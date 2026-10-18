import type { ScoredReleaseView } from '@kromatv/client/requests';
import { describe, expect, it } from 'vitest';
import { countByTab, inTab, openingTab, releaseTabOf } from './release-tab';

const accepted: Pick<ScoredReleaseView, 'score'> = { score: 900 };
const refused: Pick<ScoredReleaseView, 'score'> = { score: null };

describe('inTab', () => {
  it('splits on whether the profile accepted the release', () => {
    expect([inTab(accepted, 'accepted'), inTab(refused, 'accepted')]).toEqual([true, false]);
    expect([inTab(accepted, 'refused'), inTab(refused, 'refused')]).toEqual([false, true]);
    expect([inTab(accepted, 'all'), inTab(refused, 'all')]).toEqual([true, true]);
  });
});

describe('openingTab', () => {
  it('opens on the accepted releases when there are any', () => {
    expect(openingTab({ accepted: 3, refused: 4, all: 7 })).toBe('accepted');
  });

  it('opens on the refused releases when none passed the profile', () => {
    expect(openingTab({ accepted: 0, refused: 4, all: 4 })).toBe('refused');
  });

  it('stays on the accepted releases when nothing came back at all', () => {
    expect(openingTab({ accepted: 0, refused: 0, all: 0 })).toBe('accepted');
  });
});

describe('releaseTabOf', () => {
  it('reads a tab by name', () => {
    expect(releaseTabOf('refused')).toBe('refused');
  });

  it('refuses a name that is no tab', () => {
    expect(releaseTabOf('rejected')).toBeNull();
  });
});

describe('countByTab', () => {
  it('counts the accepted and the refused releases apart', () => {
    expect(countByTab([accepted, refused, refused])).toEqual({ accepted: 1, refused: 2, all: 3 });
  });
});
