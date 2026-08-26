import type { DiscoverEntry, MessageKey } from '@kroma/core';
import type { IconName } from '@kroma/ui/kit';
import type { MovieView, ShowView } from '#web/shared/lib/api';

export const SAVED_SORTS = ['recent', 'title', 'year', 'rating'] as const;

export type SavedSort = (typeof SAVED_SORTS)[number];

export const SAVED_TABS = ['toWatch', 'watched'] as const;

export type SavedTab = (typeof SAVED_TABS)[number];

export type SavedKind = 'all' | 'movie' | 'show';

export const SAVED_KINDS = ['all', 'movie', 'show'] as const;

/** Narrows one search-param value, so a hand-edited URL cannot put the list in a
 *  state its own controls could not reach. */
export const isSavedSort = (v: unknown): v is SavedSort => SAVED_SORTS.includes(v as SavedSort);

export const isSavedTab = (v: unknown): v is SavedTab => SAVED_TABS.includes(v as SavedTab);

export const isSavedKind = (v: unknown): v is SavedKind => SAVED_KINDS.includes(v as SavedKind);

export type SavedSource =
  | { from: 'movie'; movie: MovieView }
  | { from: 'show'; show: ShowView }
  | { from: 'discover'; entry: DiscoverEntry };

export interface SavedTitle {
  key: string;
  kind: 'movie' | 'show';
  title: string;
  year: number | null;
  rating: number | null;
  backdrop: string | null;
  available: boolean;
  source: SavedSource;
}

export interface SavedTitles {
  titles: readonly SavedTitle[];
  settled: boolean;
}

export interface SavedFacets {
  total: number;
  movies: number;
  shows: number;
  unavailable: number;
}

export interface SavedFilter {
  kind: SavedKind;
  unavailableOnly: boolean;
}

interface SavedTabCopy {
  icon: IconName;
  label: MessageKey;
  emptyTitle: MessageKey;
  emptyHint: MessageKey;
}

export const SAVED_TAB_COPY: Record<SavedTab, SavedTabCopy> = {
  toWatch: {
    icon: 'bookmark',
    label: 'content.toWatch',
    emptyTitle: 'content.myListEmpty',
    emptyHint: 'content.myListEmptyHint',
  },
  watched: {
    icon: 'eye',
    label: 'content.watched',
    emptyTitle: 'content.watchedEmpty',
    emptyHint: 'content.watchedEmptyHint',
  },
};

export function toSavedSort(value: string): SavedSort | undefined {
  return SAVED_SORTS.find((mode) => mode === value);
}

export function savedFacets(titles: readonly SavedTitle[]): SavedFacets {
  let movies = 0;
  let shows = 0;
  let unavailable = 0;
  for (const title of titles) {
    if (title.kind === 'movie') movies += 1;
    else shows += 1;
    if (!title.available) unavailable += 1;
  }
  return { total: titles.length, movies, shows, unavailable };
}

export function filterSavedTitles(
  titles: readonly SavedTitle[],
  filter: SavedFilter,
): SavedTitle[] {
  return titles.filter((title) => {
    if (filter.kind !== 'all' && title.kind !== filter.kind) return false;
    return !(filter.unavailableOnly && title.available);
  });
}

/** The title whose artwork opens the page: the best-rated one that has a
 *  backdrop. */
export function featuredSavedTitle(titles: readonly SavedTitle[]): SavedTitle | undefined {
  let best: SavedTitle | undefined;
  for (const title of titles) {
    if (!title.backdrop) continue;
    if (!best || (title.rating ?? -1) > (best.rating ?? -1)) best = title;
  }
  return best;
}

const keepSavedOrder = () => 0;

const COMPARE: Record<SavedSort, (a: SavedTitle, b: SavedTitle) => number> = {
  recent: keepSavedOrder,
  title: (a, b) => a.title.localeCompare(b.title),
  year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
};

export function sortSavedTitles(titles: readonly SavedTitle[], sort: SavedSort): SavedTitle[] {
  return [...titles].sort(COMPARE[sort]);
}
