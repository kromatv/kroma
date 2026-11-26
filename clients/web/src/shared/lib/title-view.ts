// One normalized "title" model that both the library fiche (owned) and the
// discover fiche (TMDB / request flow) render through.

import type { KromaClient } from '@kromatv/client';
import { hasPermission, type User } from '@kromatv/client/accounts';
import type { DiscoverDetail, DiscoverEntry } from '@kromatv/client/discovery';
import type {
  AgeRating,
  CastMember,
  CrewMember,
  MediaCard,
  MediaItem,
  Metadata,
  Show,
  ShowDetail,
  UpNext,
  VideoTrack,
} from '@kromatv/client/media';
import type { RequestStatus } from '@kromatv/client/requests';
import { ageRatingOf, directorsOf, formatRuntime, genreLabels, tmdbIdOf } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { imageUrl } from '#web/shared/lib/api';
import { discoverSeasons, mergeSeasons, type TitleSeason } from '#web/shared/lib/title-seasons';

export interface SimilarTarget {
  key: string;
  title: string;
  poster: string;
  genre: string;
  localId: string | null;
  tmdbId: number | null;
  kind: 'movie' | 'show';
}

export interface TitleView {
  kind: 'movie' | 'show';
  tmdbId: number | null;
  localId: string | null;
  inLibrary: boolean;
  title: string;
  originalTitle: string | null;
  year: number | null;
  rating: number | null;
  ageRating: AgeRating | null;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  runtimeMin: number | null;
  poster: string;
  backdrop: string | null;
  directors: CrewMember[];
  cast: CastMember[];
  studios: string[];
  themeUrl: string | null;
  video: VideoTrack | null;
  playable: MediaItem | null;
  playLabel: string | null;
  seasons: TitleSeason[];
  requestStatus: RequestStatus | null;
  requestProgress: number | null;
  canRequest: boolean;
  similar: SimilarTarget[];
}

/** `discover` overlays availability + request state onto owned content; it is
 * null when unavailable or the viewer lacks permission. */
export type TitleInput =
  | { source: 'movie'; item: MediaItem; similar: MediaCard[]; discover: DiscoverDetail | null }
  | {
      source: 'show';
      detail: ShowDetail;
      similarShows: Show[];
      upNext: UpNext | null;
      discover: DiscoverDetail | null;
    }
  | { source: 'discover'; detail: DiscoverDetail };

/** The "more like this" tiles for a movie, from its neighbours' cards. */
const originalTitleOf = (meta: Metadata | null | undefined) => meta?.originalTitle ?? null;
const studiosOf = (meta: Metadata | null | undefined) => meta?.studios ?? [];

export function movieSimilarTargets(
  c: KromaClient,
  t: Translate,
  cards: readonly MediaCard[],
): SimilarTarget[] {
  return cards.map((m) => ({
    key: m.id,
    title: m.title,
    poster: c.media.artwork.posterFor(m),
    genre: genreLabels(t, m.metadata)[0] ?? t('content.film'),
    localId: m.id,
    tmdbId: null,
    kind: 'movie',
  }));
}

export function buildTitleView(
  c: KromaClient,
  t: Translate,
  user: User | null,
  input: TitleInput,
): TitleView {
  const canReq = (tmdbId: number | null, hasDiscover: boolean) =>
    hasDiscover && tmdbId != null && !!user && hasPermission(user, 'requests.create');

  if (input.source === 'movie') {
    const { item, similar, discover } = input;
    const meta = item.metadata ?? null;
    return {
      kind: 'movie',
      tmdbId: tmdbIdOf(meta?.tmdbId),
      localId: item.id,
      inLibrary: true,
      title: item.title,
      originalTitle: originalTitleOf(meta),
      year: item.year ?? null,
      rating: meta?.rating ?? null,
      ageRating: ageRatingOf(meta),
      overview: meta?.overview ?? null,
      tagline: meta?.tagline ?? null,
      genres: genreLabels(t, meta),
      runtimeMin: null,
      poster: c.media.artwork.posterFor(item),
      backdrop: c.media.artwork.backdropFor(item),
      directors: directorsOf(meta?.crew),
      cast: meta?.cast ?? [],
      studios: studiosOf(meta),
      themeUrl: null,
      video: item.video,
      playable: item,
      playLabel: null,
      seasons: [],
      requestStatus: discover?.requestStatus ?? null,
      requestProgress: discover?.requestProgress ?? null,
      canRequest: false,
      similar: movieSimilarTargets(c, t, similar),
    };
  }

  if (input.source === 'show') {
    const { detail, similarShows, upNext, discover } = input;
    const show = detail.show;
    const meta = show.metadata ?? null;
    const first = detail.seasons[0]?.episodes[0] ?? null;
    const playTarget = upNext?.item ?? first;
    const episodeKey = upNext?.resume ? 'player.resumeEpisode' : 'player.playEpisode';
    const playLabel =
      playTarget?.season != null && playTarget.episode != null
        ? t(episodeKey, {
            season: playTarget.season,
            episode: playTarget.episode,
          })
        : null;
    return {
      kind: 'show',
      tmdbId: tmdbIdOf(meta?.tmdbId),
      localId: show.id,
      inLibrary: true,
      title: show.title,
      originalTitle: originalTitleOf(meta),
      year: show.year ?? null,
      rating: meta?.rating ?? null,
      ageRating: ageRatingOf(meta),
      overview: meta?.overview ?? null,
      tagline: meta?.tagline ?? null,
      genres: genreLabels(t, meta),
      runtimeMin: null,
      poster: c.media.artwork.showPosterFor(show),
      backdrop: c.media.artwork.backdropFor(show),
      directors: directorsOf(meta?.crew),
      cast: meta?.cast ?? [],
      studios: studiosOf(meta),
      themeUrl: c.media.artwork.themeFor(show),
      video: show.video,
      playable: playTarget,
      playLabel,
      seasons: mergeSeasons(c, detail, discover),
      requestStatus: discover?.requestStatus ?? null,
      requestProgress: discover?.requestProgress ?? null,
      canRequest: canReq(tmdbIdOf(meta?.tmdbId), discover != null),
      similar: similarShows.map((s) => ({
        key: s.id,
        title: s.title,
        poster: c.media.artwork.showPosterFor(s),
        genre: t('content.seasonCount', { count: s.seasonCount }),
        localId: s.id,
        tmdbId: null,
        kind: 'show' as const,
      })),
    };
  }

  const d = input.detail;
  return {
    kind: d.kind,
    tmdbId: d.tmdbId,
    localId: d.localId,
    inLibrary: d.inLibrary,
    title: d.title,
    originalTitle: d.originalTitle,
    year: d.year,
    rating: d.rating,
    ageRating: d.ageRating,
    overview: d.overview,
    tagline: d.tagline,
    genres: genreLabels(t, d),
    runtimeMin: d.runtimeMin,
    poster: imageUrl(d.posterUrl) ?? '',
    backdrop: imageUrl(d.backdropUrl),
    directors: directorsOf(d.crew),
    cast: d.cast,
    studios: d.studios,
    themeUrl: null,
    video: null,
    playable: null,
    playLabel: null,
    seasons: discoverSeasons(d),
    requestStatus: d.requestStatus,
    requestProgress: d.requestProgress,
    canRequest: canReq(d.tmdbId, true),
    similar: d.similar.map((e: DiscoverEntry) => ({
      key: e.inLibrary && e.localId ? e.localId : `tmdb:${e.tmdbId}`,
      title: e.title,
      poster: imageUrl(e.posterUrl) ?? '',
      genre: t(e.kind === 'show' ? 'discover.kindShow' : 'discover.kindMovie'),
      localId: e.localId,
      tmdbId: e.tmdbId,
      kind: e.kind,
    })),
  };
}

/** "2024 · 2h08" from a not-owned title's year + TMDB runtime (movies only). */
export function tmdbMetaLine(t: Translate, year: number | null, runtimeMin: number | null): string {
  const parts: string[] = [];
  if (year) {
    parts.push(String(year));
  }
  const rt = formatRuntime(t, (runtimeMin ?? 0) * 60000);
  if (rt) {
    parts.push(rt);
  }
  return parts.join(' · ');
}
