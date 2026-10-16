import type { RequestKind, SearchScope } from '@kromatv/client/requests';
import { numberOrNull } from './free-search-target';
import type { TitleScope } from './rules-schemas';

export type TitleTarget = 'all' | 'season' | 'episode';

/** Null while a number the target needs is still missing. */
export function scopeOfTarget(
  kind: RequestKind,
  target: TitleTarget,
  season: string,
  episode: string,
): SearchScope | null {
  if (kind === 'movie') return { scope: 'movie' };
  if (target === 'all') return { scope: 'all' };
  const number = numberOrNull(season);
  if (number == null) return null;
  if (target === 'season') return { scope: 'season', season: number };
  const which = numberOrNull(episode);
  return which == null || which < 1 ? null : { scope: 'episode', season: number, episode: which };
}

export function toTitleScope(scope: SearchScope): TitleScope {
  switch (scope.scope) {
    case 'all':
      return { kind: 'all' };
    case 'movie':
      return { kind: 'movie' };
    case 'season':
      return { kind: 'season', season: scope.season };
    case 'episode':
      return { kind: 'episode', season: scope.season, episode: scope.episode };
  }
}
