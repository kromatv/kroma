// Central query-options factory: one place for every query key + fetcher, so
// route loaders (`ensureQueryData`) and components (`useSuspenseQuery`/`useQuery`)
// share the exact same cache entry.
import type {
  DiscoverDetail,
  DiscoverType,
  ItemId,
  Show,
  ShowDetail,
  ShowId,
  UpNext,
} from '@kroma/core';
import { genreSlugs } from '@kroma/core';
import { queryOptions } from '@tanstack/react-query';
import {
  kromaClient,
  type MovieView,
  type ShowView,
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
export type HeroEntry = { type: 'movie'; movie: MovieView } | { type: 'show'; show: ShowView };

export const catalogQueries = {
  /** All movies, art/stream URLs pre-resolved. */
  moviesView: () =>
    queryOptions({
      queryKey: ['movies', 'view'] as const,
      queryFn: async (): Promise<MovieView[]> => {
        const c = kromaClient();
        return (await c.media.movies()).map((m) => toMovieView(c, m));
      },
    }),

  /** All shows, art pre-resolved. */
  showsView: () =>
    queryOptions({
      queryKey: ['shows', 'view'] as const,
      queryFn: async (): Promise<ShowView[]> => {
        const c = kromaClient();
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
        const c = kromaClient();
        const hero = await c.media.featured().catch(() => null);
        if (!hero) return null;
        return hero.type === 'movie'
          ? { type: 'movie', movie: toMovieView(c, hero.item) }
          : { type: 'show', show: toShowView(c, hero.show) };
      },
    }),

  /** Raw movie list (unmapped) used where the id-only data is enough. */
  movies: () => kromaClient().query.media.movies(),

  shows: () => kromaClient().query.media.shows(),

  item: (id: ItemId) => kromaClient().query.media.item(id),

  show: (id: ShowId) => kromaClient().query.media.show(id),

  /** The full show-detail bundle (detail + similar + up-next + discover overlay),
   * keyed under its show so one invalidate drops both. */
  showBundle: (id: ShowId) =>
    queryOptions({
      queryKey: [...kromaClient().query.media.show(id).queryKey, 'bundle'],
      queryFn: async (): Promise<ShowBundle> => {
        const c = kromaClient();
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
      queryFn: () =>
        kromaClient()
          .media.similar(id)
          .catch(() => []),
    }),

  personCredits: (person: string) => kromaClient().query.media.people(person),

  /** The provider profile behind a credit (biography, birth, birthplace). A
   * page renders fine without it, so a failed lookup resolves to an empty
   * envelope rather than throwing the route into its error boundary. */
  personDetails: (person: string) =>
    queryOptions({
      queryKey: ['person-details', person] as const,
      staleTime: 60 * 60_000,
      queryFn: () =>
        kromaClient()
          .media.person(person)
          .catch(() => ({ name: person, person: null, credits: [] })),
    }),

  upNext: (showId: ShowId) => kromaClient().query.playback.upNext(showId),

  /** The player payload: the item (art/stream URLs resolved) + its upcoming
   * episodes. `next` (the immediate one) drives autoplay; the full list fills the
   * player's "up next" episode rail. */
  watch: (id: ItemId) =>
    queryOptions({
      queryKey: ['watch', id] as const,
      queryFn: async () => {
        const c = kromaClient();
        const [item, following] = await Promise.all([c.media.item(id), c.playback.following(id)]);
        return { item: toMovieView(c, item), next: following[0] ?? null, following };
      },
    }),
} as const;

// Only mount once `ready && user`.
export const userQueries = {
  home: () => kromaClient().query.media.home(),

  continueWatching: () => kromaClient().query.playback.continueWatching(),

  /** Resume progress for every item, keyed for cheap lookup. */
  progress: () => kromaClient().query.playback.progress(),

  myRequests: () => kromaClient().query.requests.list({ mine: true }),

  /** The "coming soon" calendar: own upcoming, not-yet-available releases. */
  calendar: () => kromaClient().query.requests.calendar({ mine: true }),

  /** The "missing / wanted" list: own aired/released items not yet on disk. */
  missing: () => kromaClient().query.requests.missing({ mine: true }),

  /** The account's signed-in devices (for the /account security section). */
  sessions: () => kromaClient().query.accounts.sessions(),

  /** The account's registered passkeys (for the /account security section). */
  passkeys: () => kromaClient().query.accounts.passkeys.list(),

  /** The notification centre. No poll: the server pushes `notification.created`
   * over the (addressed) event stream, so the bell invalidates on demand. */
  notifications: () => kromaClient().query.notifications.list(),

  /** The per-category delivery matrix (for the /account settings section). */
  notificationPrefs: () => kromaClient().query.notifications.prefs(),

  /** The server's VAPID key + whether this account has a push endpoint. */
  pushKey: () => kromaClient().query.notifications.push.key(),
} as const;

export const serverQueries = {
  /** Public `GET /api/health`: server version + basic counts (no auth). Used by
   * the sidebar to show the server version; cached generously as it rarely moves. */
  health: () => ({ ...kromaClient().query.media.health(), staleTime: 5 * 60_000 }),

  /** Public `GET /api/splash`: the sign-in screen's random art sample (no
   * auth). Cached for the visit so the slideshow rotates a stable set. */
  splash: () => ({ ...kromaClient().query.media.splash(), staleTime: 10 * 60_000 }),
} as const;

export const discoverQueries = {
  detail: (kind: 'movie' | 'tv', tmdbId: number) =>
    kromaClient().query.discovery.detail(kind, tmdbId),

  trending: (type: DiscoverType, page: number) =>
    kromaClient().query.discovery.trending({ type, page }),
} as const;
