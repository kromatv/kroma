import type { DiscoverDetail, DiscoverSeasonEpisodes } from '@kromatv/client/discovery';
import { useEffect, useMemo, useState } from 'react';
import type { WatchableTarget } from '../watchable';
import {
  type WatchNext,
  type WatchShowGuide,
  watchFollowing,
  watchGuideGap,
} from '../watchable-next';

export interface WatchGuideReader {
  season: (tmdbId: number, season: number) => Promise<DiscoverSeasonEpisodes>;
  detail: (kind: 'tv', tmdbId: number) => Promise<Pick<DiscoverDetail, 'title' | 'seasons'>>;
}

type Fold = (guide: WatchShowGuide) => WatchShowGuide;

const NOTHING: WatchShowGuide = { episodes: new Map(), show: null };

export interface WatchFollowingOptions {
  discovery: WatchGuideReader | null | undefined;
  target: WatchableTarget;
}

async function readSeason(
  discovery: WatchGuideReader,
  tmdbId: number,
  season: number,
): Promise<Fold> {
  const episodes = await discovery.season(tmdbId, season).then(
    (listing) => listing.episodes,
    () => [],
  );
  return (guide) => ({ ...guide, episodes: new Map(guide.episodes).set(season, episodes) });
}

async function readShow(discovery: WatchGuideReader, tmdbId: number): Promise<Fold> {
  const show = await discovery.detail('tv', tmdbId).then(
    ({ title, seasons }) => ({ title, seasons }),
    () => ({ title: null, seasons: [] }),
  );
  return (guide) => ({ ...guide, show });
}

/**
 * The episodes after the one `target` plays, titled and pictured by TMDB. A read
 * that fails counts as an empty answer, so a show TMDB cannot describe still
 * follows its own download.
 */
export function useWatchFollowing(opts: Readonly<WatchFollowingOptions>): WatchNext[] {
  const { discovery, target } = opts;
  const tmdbId = target.entry.tmdbId;
  const [read, setRead] = useState({ tmdbId, guide: NOTHING });
  const guide = read.tmdbId === tmdbId ? read.guide : NOTHING;
  const gap = watchGuideGap(target, guide);
  const wanted = gap?.kind === 'season' ? gap.season : (gap?.kind ?? null);

  useEffect(() => {
    if (!discovery || tmdbId === null || wanted === null) return;
    let live = true;
    const reading =
      wanted === 'show' ? readShow(discovery, tmdbId) : readSeason(discovery, tmdbId, wanted);
    void reading.then((fold) => {
      if (!live) return;
      setRead((last) => ({
        tmdbId,
        guide: fold(last.tmdbId === tmdbId ? last.guide : NOTHING),
      }));
    });
    return () => {
      live = false;
    };
  }, [discovery, tmdbId, wanted]);

  return useMemo(() => watchFollowing(target, guide), [target, guide]);
}
