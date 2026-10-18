import type { ScoredReleaseView } from '@kromatv/client/requests';

export const RELEASE_TABS = ['accepted', 'refused', 'all'] as const;
export type ReleaseTab = (typeof RELEASE_TABS)[number];

export type TabCounts = Record<ReleaseTab, number>;

export function releaseTabOf(value: string): ReleaseTab | null {
  return RELEASE_TABS.find((one) => one === value) ?? null;
}

/** Whether a release belongs under a tab: the profile accepted it, refused it,
 *  or either. */
export function inTab(release: Pick<ScoredReleaseView, 'score'>, tab: ReleaseTab): boolean {
  if (tab === 'all') return true;
  return (release.score != null) === (tab === 'accepted');
}

export function countByTab(releases: readonly Pick<ScoredReleaseView, 'score'>[]): TabCounts {
  const accepted = releases.filter((release) => release.score != null).length;
  return { accepted, refused: releases.length - accepted, all: releases.length };
}

/** The tab a search opens on: the accepted releases, unless none passed the
 *  profile and some were refused. */
export function openingTab(counts: TabCounts): ReleaseTab {
  return counts.accepted === 0 && counts.refused > 0 ? 'refused' : 'accepted';
}
