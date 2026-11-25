import type { KromaClient } from '@kromatv/client';
import type { DiscoverDetail, DiscoverEpisode, DiscoverSeason } from '@kromatv/client/discovery';
import type {
  CastMember,
  ListedEpisode,
  MediaItem,
  Season,
  ShowDetail,
} from '@kromatv/client/media';
import { imageUrl } from '#web/shared/lib/api';

export type SeasonGap = ListedEpisode | DiscoverEpisode;

/** A season in the unified model: owned playable episodes merged with TMDB
 * availability. */
export interface TitleSeason {
  number: number;
  name: string | null;
  poster: string | null;
  episodeCount: number;
  episodesAvailable: number;
  available: boolean;
  requested: boolean;
  airDate: string | null;
  episodes: MediaItem[];
  missing: SeasonGap[];
  cast: CastMember[];
}

/** A TMDB title's seasons, none of them on disk. */
export function discoverSeasons(d: DiscoverDetail): TitleSeason[] {
  return d.seasons.map((s) =>
    seasonOf({ number: s.season, listed: s, poster: imageUrl(s.posterUrl ?? d.posterUrl) }),
  );
}

/** A show's seasons on disk merged with the ones TMDB lists, by number. */
export function mergeSeasons(
  c: KromaClient,
  detail: ShowDetail,
  discover: DiscoverDetail | null,
): TitleSeason[] {
  const ownedBy = new Map(detail.seasons.map((s) => [s.number, s]));
  const listed = discover?.seasons ?? [];
  const showPoster = c.media.artwork.showPosterFor(detail.show);
  const numbers = new Set<number>([...ownedBy.keys(), ...listed.map((s) => s.season)]);
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number) => {
      const own = ownedBy.get(number);
      const tmdb = listed.find((s) => s.season === number);
      const poster = c.media.artwork.resolve(own?.posterUrl ?? tmdb?.posterUrl) ?? showPoster;
      return seasonOf({ number, own, listed: tmdb, poster });
    });
}

type SeasonParts = Readonly<{
  number: number;
  own?: Season;
  listed?: DiscoverSeason;
  poster: string | null;
}>;

function seasonOf({ number, own, listed, poster }: SeasonParts): TitleSeason {
  return { number, poster, ...listedFacts(listed, own?.episodes.length ?? 0), ...ownedParts(own) };
}

function listedFacts(listed: DiscoverSeason | undefined, onDisk: number) {
  if (!listed) {
    return {
      name: null,
      episodeCount: onDisk,
      episodesAvailable: onDisk,
      available: true,
      requested: false,
      airDate: null,
    };
  }
  const { name, available, requested, airDate } = listed;
  const episodeCount: number | undefined = listed.episodeCount;
  const episodesAvailable: number | undefined = listed.episodesAvailable;
  return {
    name,
    episodeCount: episodeCount ?? onDisk,
    episodesAvailable: episodesAvailable ?? onDisk,
    available,
    requested,
    airDate,
  };
}

function ownedParts(own: Season | undefined) {
  if (!own) {
    return { episodes: [], missing: [], cast: [] };
  }
  return { episodes: own.episodes, missing: own.missing ?? [], cast: own.cast ?? [] };
}
