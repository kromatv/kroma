// Central query-options factory: one place for every query key + fetcher, so
// route loaders (`ensureQueryData`) and components (`useSuspenseQuery`/`useQuery`)
// share the exact same cache entry. Each fetcher goes through the ad-hoc
// `kromaClient()` (in-memory bearer, self-refreshing on 401), so these work the
// same whether called from a loader or a component.
import type { DiscoverDetail, DiscoverType, Show, ShowDetail, UpNext } from '@kroma/core';
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
        return (await c.movies()).map((m) => toMovieView(c, m));
      },
    }),

  /** All shows, art pre-resolved. */
  showsView: () =>
    queryOptions({
      queryKey: ['shows', 'view'] as const,
      queryFn: async (): Promise<ShowView[]> => {
        const c = kromaClient();
        return (await c.shows()).map((s) => toShowView(c, s));
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
        const hero = await c.featured().catch(() => null);
        if (!hero) return null;
        return hero.type === 'movie'
          ? { type: 'movie', movie: toMovieView(c, hero.item) }
          : { type: 'show', show: toShowView(c, hero.show) };
      },
    }),

  /** Raw movie list (unmapped) used where the id-only data is enough. */
  movies: () =>
    queryOptions({ queryKey: ['movies'] as const, queryFn: () => kromaClient().movies() }),

  shows: () => queryOptions({ queryKey: ['shows'] as const, queryFn: () => kromaClient().shows() }),

  item: (id: string) =>
    queryOptions({ queryKey: ['item', id] as const, queryFn: () => kromaClient().item(id) }),

  show: (id: string) =>
    queryOptions({ queryKey: ['show', id] as const, queryFn: () => kromaClient().show(id) }),

  /** The full show-detail bundle (detail + similar + up-next + discover overlay). */
  showBundle: (id: string) =>
    queryOptions({
      queryKey: ['show', id, 'bundle'] as const,
      queryFn: async (): Promise<ShowBundle> => {
        const c = kromaClient();
        const [detail, shows] = await Promise.all([c.show(id), c.shows()]);
        const show = detail.show;
        const tmdbId = show.metadata?.tmdbId ?? null;
        // The discover overlay (season availability + request state) is fetched
        // only for an enriched show and degrades to null for viewers without
        // `requests.create` (a 403 the server returns before any TMDB call).
        const [upNext, discover] = await Promise.all([
          c.upNext(show.id).catch(() => null),
          tmdbId != null ? c.discoverDetail('tv', tmdbId).catch(() => null) : Promise.resolve(null),
        ]);
        const genres = new Set(genreSlugs(show.metadata));
        const others = shows.filter((s) => s.id !== show.id);
        const related = others.filter((s) => genreSlugs(s.metadata).some((g) => genres.has(g)));
        const similarShows = (related.length >= 3 ? related : others).slice(0, 12);
        return { detail, similarShows, upNext, discover };
      },
    }),

  similar: (id: string) =>
    queryOptions({
      queryKey: ['similar', id] as const,
      // The catalogue tolerates a missing similar list (falls back to genre
      // overlap), so swallow failures into an empty array here.
      queryFn: () =>
        kromaClient()
          .similar(id)
          .catch(() => []),
    }),

  personCredits: (person: string) =>
    queryOptions({
      queryKey: ['person', person] as const,
      queryFn: () => kromaClient().personCredits(person),
    }),

  /** The provider profile behind a credit (biography, birth, birthplace). A
   * page renders fine without it, so a failed lookup resolves to an empty
   * envelope rather than throwing the route into its error boundary. */
  personDetails: (person: string) =>
    queryOptions({
      queryKey: ['person-details', person] as const,
      staleTime: 60 * 60_000,
      queryFn: () =>
        kromaClient()
          .personDetails(person)
          .catch(() => ({ name: person, person: null, credits: [] })),
    }),

  upNext: (showId: string) =>
    queryOptions({
      queryKey: ['upNext', showId] as const,
      queryFn: () => kromaClient().upNext(showId),
    }),

  /** The player payload: the item (art/stream URLs resolved) + its upcoming
   * episodes. `next` (the immediate one) drives autoplay; the full list fills the
   * player's "up next" episode rail. */
  watch: (id: string) =>
    queryOptions({
      queryKey: ['watch', id] as const,
      queryFn: async () => {
        const c = kromaClient();
        const [item, following] = await Promise.all([c.item(id), c.followingEpisodes(id)]);
        return { item: toMovieView(c, item), next: following[0] ?? null, following };
      },
    }),
} as const;

// Only mount once `ready && user`.
export const userQueries = {
  home: () => queryOptions({ queryKey: ['home'] as const, queryFn: () => kromaClient().home() }),

  continueWatching: () =>
    queryOptions({
      queryKey: ['continueWatching'] as const,
      queryFn: () => kromaClient().continueWatching(),
    }),

  /** Resume progress for every item, keyed for cheap lookup. */
  progress: () =>
    queryOptions({ queryKey: ['progress'] as const, queryFn: () => kromaClient().progress() }),

  myRequests: () =>
    queryOptions({
      queryKey: ['requests', 'mine'] as const,
      queryFn: () => kromaClient().listRequests({ mine: true }),
    }),

  /** The "coming soon" calendar: own upcoming, not-yet-available releases. */
  calendar: () =>
    queryOptions({
      queryKey: ['requests', 'calendar'] as const,
      queryFn: () => kromaClient().getCalendar({ mine: true }),
    }),

  /** The "missing / wanted" list: own aired/released items not yet on disk. */
  missing: () =>
    queryOptions({
      queryKey: ['requests', 'missing'] as const,
      queryFn: () => kromaClient().getMissing({ mine: true }),
    }),

  /** The account's signed-in devices (for the /account security section). */
  sessions: () =>
    queryOptions({ queryKey: ['sessions'] as const, queryFn: () => kromaClient().listSessions() }),

  /** The account's registered passkeys (for the /account security section). */
  passkeys: () =>
    queryOptions({ queryKey: ['passkeys'] as const, queryFn: () => kromaClient().listPasskeys() }),

  /** The notification centre. No poll: the server pushes `notification.created`
   * over the (addressed) event stream, so the bell invalidates on demand. */
  notifications: () =>
    queryOptions({
      queryKey: ['notifications'] as const,
      queryFn: () => kromaClient().listNotifications(),
    }),

  /** The per-category delivery matrix (for the /account settings section).
   * Its own key prefix, not `['notifications', …]`: a notification arriving must
   * not invalidate the settings matrix. */
  notificationPrefs: () =>
    queryOptions({
      queryKey: ['notification-prefs'] as const,
      queryFn: () => kromaClient().getNotificationPrefs(),
    }),

  /** The server's VAPID key + whether this account has a push endpoint. */
  pushKey: () =>
    queryOptions({ queryKey: ['push-key'] as const, queryFn: () => kromaClient().pushKey() }),
} as const;

export const serverQueries = {
  /** Public `GET /api/health`: server version + basic counts (no auth). Used by
   * the sidebar to show the server version; cached generously as it rarely moves. */
  health: () =>
    queryOptions({
      queryKey: ['health'] as const,
      queryFn: () => kromaClient().health(),
      staleTime: 5 * 60_000,
    }),
  /** Public `GET /api/splash`: the sign-in screen's random art sample (no
   * auth). Cached for the visit so the slideshow rotates a stable set. */
  splash: () =>
    queryOptions({
      queryKey: ['splash'] as const,
      queryFn: () => kromaClient().splash(),
      staleTime: 10 * 60_000,
    }),
} as const;

export const discoverQueries = {
  detail: (kind: 'movie' | 'tv', tmdbId: number) =>
    queryOptions({
      queryKey: ['discover', 'detail', kind, tmdbId] as const,
      queryFn: () => kromaClient().discoverDetail(kind, tmdbId),
    }),

  trending: (type: DiscoverType, page: number) =>
    queryOptions({
      queryKey: ['discover', 'trending', type, page] as const,
      queryFn: () => kromaClient().discoverTrending({ type, page }),
    }),
} as const;
