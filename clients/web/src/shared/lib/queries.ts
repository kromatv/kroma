// Central query-options factory: one place for every query key + fetcher, so
// route loaders (`ensureQueryData`) and components (`useSuspenseQuery`/`useQuery`)
// share the exact same cache entry.
import type { DiscoverDetail, DiscoverType } from '@kromatv/client/discovery';
import type { ItemId, Show, ShowDetail, ShowId, UpNext } from '@kromatv/client/media';
import type { QueryClient } from '@kromatv/client/query';
import { genreSlugs } from '@kromatv/core';
import { queryOptions } from '@tanstack/react-query';
import {
  type MovieCardView,
  type ShowView,
  toMovieCardView,
  toMovieView,
  toShowView,
} from '#web/shared/lib/api';

/** Everything the show-detail page needs, in one cache entry. It's inherently
 * two-stage (the TMDB discover overlay keys off the show's tmdbId, known only
 * after the show loads) and conditional, so unlike the movie page it doesn't
 * decompose into independent `useSuspenseQuery` calls. */
export interface ShowBundle {
  detail: ShowDetail;
  similarShows: Show[];
  upNext: UpNext | null;
  discover: DiscoverDetail | null;
}

/** What the featured banner spotlights: the mapped hero (the server's daily pick
 * with art/stream URLs resolved, or the local movie fallback wrapped in the same
 * shape). The queries that can come up empty spell the `| null` themselves. */
export type HeroEntry = { type: 'movie'; movie: MovieCardView } | { type: 'show'; show: ShowView };

/** Query factories capture the API client owned by this router. */
export function createQueries(client: QueryClient) {
  const catalogQueries = {
    /** All movies as a grid draws them, art pre-resolved. */
    moviesView: () =>
      queryOptions({
        queryKey: ['movies', 'view'] as const,
        queryFn: async (): Promise<MovieCardView[]> => {
          const c = client;
          return (await c.media.movieCards()).map((m) => toMovieCardView(c, m));
        },
      }),

    /** All shows, art pre-resolved. */
    showsView: () =>
      queryOptions({
        queryKey: ['shows', 'view'] as const,
        queryFn: async (): Promise<ShowView[]> => {
          const c = client;
          return (await c.media.shows()).map((s) => toShowView(c, s));
        },
      }),

    /** Today's server-picked "En vedette" hero (movie or show), art pre-resolved.
     * Resolves to null on an empty catalogue or an older server without the
     * endpoint the home falls back to the first movie. */
    featured: () =>
      queryOptions({
        queryKey: ['featured'] as const,
        queryFn: async (): Promise<HeroEntry | null> => {
          const c = client;
          const hero = await c.media.featured().catch(() => null);
          if (!hero) return null;
          return hero.type === 'movie'
            ? { type: 'movie', movie: toMovieView(c, hero.item) }
            : { type: 'show', show: toShowView(c, hero.show) };
        },
      }),

    shows: () => client.query.media.shows(),

    item: (id: ItemId) => client.query.media.item(id),

    show: (id: ShowId) => client.query.media.show(id),

    /** The full show-detail bundle (detail + similar + up-next + discover overlay),
     * keyed under its show so one invalidate drops both. */
    showBundle: (id: ShowId) =>
      queryOptions({
        queryKey: [...client.query.media.show(id).queryKey, 'bundle'],
        queryFn: async (): Promise<ShowBundle> => {
          const c = client;
          const [detail, shows] = await Promise.all([c.media.show(id), c.media.shows()]);
          const show = detail.show;
          const tmdbId = show.metadata?.tmdbId ?? null;
          // The discover overlay (season availability + request state) is fetched
          // only for an enriched show and degrades to null for viewers without
          // `requests.create` (a 403 the server returns before any TMDB call).
          const [upNext, discover] = await Promise.all([
            c.playback.upNext(show.id).catch(() => null),
            tmdbId != null
              ? c.discovery.detail('tv', tmdbId).catch(() => null)
              : Promise.resolve(null),
          ]);
          const genres = new Set(genreSlugs(show.metadata));
          const others = shows.filter((s) => s.id !== show.id);
          const related = others.filter((s) => genreSlugs(s.metadata).some((g) => genres.has(g)));
          const similarShows = (related.length >= 3 ? related : others).slice(0, 12);
          return { detail, similarShows, upNext, discover };
        },
      }),

    similar: (id: ItemId) =>
      queryOptions({
        queryKey: ['similar', id] as const,
        // The catalogue tolerates a missing similar list (falls back to genre
        // overlap), so swallow failures into an empty array here.
        queryFn: () => client.media.similar(id).catch(() => []),
      }),

    personCredits: (person: string) => client.query.media.people(person),

    /** The provider profile behind a credit (biography, birth, birthplace). A
     * page renders fine without it, so a failed lookup resolves to an empty
     * envelope rather than throwing the route into its error boundary. */
    personDetails: (person: string) =>
      queryOptions({
        queryKey: ['person-details', person] as const,
        staleTime: 60 * 60_000,
        queryFn: () =>
          client.media.person(person).catch(() => ({ name: person, person: null, credits: [] })),
      }),

    upNext: (showId: ShowId) => client.query.playback.upNext(showId),

    /** The player payload: the item (art/stream URLs resolved) + its upcoming
     * episodes. `next` (the immediate one) drives autoplay; the full list fills the
     * player's "up next" episode rail. */
    watch: (id: ItemId) =>
      queryOptions({
        queryKey: ['watch', id] as const,
        queryFn: async () => {
          const c = client;
          const [item, following] = await Promise.all([c.media.item(id), c.playback.following(id)]);
          return { item: toMovieView(c, item), next: following[0] ?? null, following };
        },
      }),
  } as const;

  // Only mount once `ready && user`.
  const userQueries = {
    home: () => client.query.media.home(),

    continueWatching: () => client.query.playback.continueWatching(),

    /** Resume progress for every item, keyed for cheap lookup. */
    progress: () => client.query.playback.progress(),

    myRequests: () => client.query.requests.list({ mine: true }),

    /** The "coming soon" calendar: own upcoming, not-yet-available releases. */
    calendar: () => client.query.requests.calendar({ mine: true }),

    /** The "missing / wanted" list: own aired/released items not yet on disk. */
    missing: () => client.query.requests.missing({ mine: true }),

    /** The account's signed-in devices (for the /account security section). */
    sessions: () => client.query.accounts.sessions(),

    /** The account's registered passkeys (for the /account security section). */
    passkeys: () => client.query.accounts.passkeys.list(),

    /** The notification centre. No poll: the server pushes `notification.created`
     * over the (addressed) event stream, so the bell invalidates on demand. */
    notifications: () => client.query.notifications.list(),

    /** The per-category delivery matrix (for the /account settings section). */
    notificationPrefs: () => client.query.notifications.prefs(),

    /** What became of this account's own pushes (for the /account settings
     * section), so a device that never rang can say why. */
    deliveries: () => client.query.notifications.deliveries(),

    /** The server's VAPID key + whether this account has a push endpoint. */
    pushKey: () => client.query.notifications.push.key(),

    releases: () => client.query.releases.list(),
  } as const;

  const serverQueries = {
    /** Public `GET /api/health`: server version + basic counts (no auth). Used by
     * the sidebar to show the server version; cached generously as it rarely moves. */
    health: () => ({ ...client.query.media.health(), staleTime: 5 * 60_000 }),

    /** Public `GET /api/splash`: the sign-in screen's random art sample (no
     * auth). Cached for the visit so the slideshow rotates a stable set. */
    splash: () => ({ ...client.query.media.splash(), staleTime: 10 * 60_000 }),
  } as const;

  const discoverQueries = {
    detail: (kind: 'movie' | 'tv', tmdbId: number) => client.query.discovery.detail(kind, tmdbId),

    season: (tmdbId: number, season: number) => client.query.discovery.season(tmdbId, season),

    trending: (type: DiscoverType, page: number) => client.query.discovery.trending({ type, page }),
  } as const;

  return { catalogQueries, userQueries, serverQueries, discoverQueries };
}
