import { useFetch } from '@kroma/module-sdk';
import { useMemo } from 'react';
import { useTorrentsApi } from './api';
import type { EpisodeInfo } from './schemas';

const NONE: Map<number, EpisodeInfo> = new Map();

/** Episode names for `season` of `tmdbId`, or an empty map while they are
 *  unknown. Best-effort by design: a file list reads fine without them, so a
 *  failure is silent rather than an error the operator has to dismiss. */
export function useEpisodeNames(
  tmdbId: number | null | undefined,
  season: number | null | undefined,
): Map<number, EpisodeInfo> {
  const torrents = useTorrentsApi();
  const known = !!tmdbId && season !== null && season !== undefined;
  const { data } = useFetch(known ? ['admin', 'torrents', 'episodes', tmdbId, season] : null, () =>
    torrents.episodes(tmdbId as number, season as number),
  );
  return useMemo(() => (data ? new Map(data.map((e) => [e.episode, e])) : NONE), [data]);
}
