// Ordering and filtering for the interactive-search results. Pure, because
// "why is this release above that one" is the question the admin is actually
// asking of the table.

import type { ScoredReleaseView } from '@kroma/core';

export type ReleaseSort = 'score' | 'size' | 'seeders' | 'date';
export type ReleaseFilter = 'accepted' | 'rejected' | 'all';

export function filterReleases(
  releases: readonly ScoredReleaseView[],
  filter: ReleaseFilter,
): ScoredReleaseView[] {
  if (filter === 'all') return [...releases];
  const accepted = filter === 'accepted';
  return releases.filter((r) => (r.score != null) === accepted);
}

// A rejected release has no score, so it sorts last whatever the column: it is
// shown for the reason, not for its rank.
function rank(r: ScoredReleaseView, sort: ReleaseSort): number {
  switch (sort) {
    case 'score':
      return r.score ?? Number.NEGATIVE_INFINITY;
    case 'size':
      return r.sizeBytes ?? 0;
    case 'seeders':
      return r.seeders ?? 0;
    case 'date':
      return r.publishedAt ? Date.parse(r.publishedAt) || 0 : 0;
  }
}

export function sortReleases(
  releases: readonly ScoredReleaseView[],
  sort: ReleaseSort,
): ScoredReleaseView[] {
  return [...releases].sort((a, b) => {
    const rejected = Number(a.score == null) - Number(b.score == null);
    if (rejected !== 0) return rejected;
    return rank(b, sort) - rank(a, sort);
  });
}

/** `S03E07` / `S03 pack` / null for a movie: what this release would satisfy. */
export function targetLabel(r: ScoredReleaseView): string | null {
  if (r.target === 'movie') return null;
  const s = String(r.season ?? 0).padStart(2, '0');
  if (r.target === 'season') return `S${s}`;
  return `S${s}E${String(r.episodes?.[0] ?? 0).padStart(2, '0')}`;
}
