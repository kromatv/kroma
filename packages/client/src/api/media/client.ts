import type { RequestContext } from '../../core/client';
import { JobStarted } from '../jobs';
import { artworkUrls } from './artwork';
import type { ItemId, LibraryId, ShowId } from './ids';
import { rematchApi } from './rematch';
import {
  Health,
  Library,
  MediaItem,
  Section,
  SectionItem,
  Show,
  ShowDetail,
  SplashEntry,
} from './schemas';
import { PersonDetailResponse, PersonResponse, SearchResponse } from './search';
import { StoryboardManifest } from './tracks';
import type mediaUrls from './urls';

/** The catalogue: what the library holds, and the URLs that play it. */
export default function mediaApi(ctx: RequestContext) {
  const artwork = artworkUrls(ctx);

  return {
    artwork: {
      /** Real poster bytes (cached TMDB art) for the OS "Now Playing" artwork;
       * prefers a raster over the generated SVG placeholder, which NSImage cannot
       * render. */
      posterBlob: async (item: Pick<MediaItem, 'id' | 'metadata'>): Promise<Blob> => {
        const raw = item.metadata?.posterUrl;
        if (raw && /^https?:\/\//.test(raw)) {
          const res = await ctx.external(raw);
          if (!res.ok) throw new Error(`poster ${res.status}`);
          return res.blob();
        }
        if (raw) return ctx.blob(raw.replace(/^\/api\b/, ''));
        return ctx.blob('/items/:id/poster', { params: { id: item.id } });
      },
    },
    rematch: rematchApi(ctx),

    /** Server liveness + counts. Takes a `signal` so a client-side heartbeat can
     * bound the probe with a short timeout. */
    health: (opts?: { signal?: AbortSignal }) => ctx.get('/health', Health, opts),

    /** Anonymous sign-in splash: a small random sample of backdrop art with
     * captions, art URLs resolved against the server base like every poster. */
    splash: async (): Promise<SplashEntry[]> => {
      const entries = await ctx.get('/splash', SplashEntry.array(), { concurrency: 'share' });
      return entries.map((e) => ({
        ...e,
        backdropUrl: artwork.resolve(e.backdropUrl) ?? e.backdropUrl,
      }));
    },

    libraries: () => ctx.get('/libraries', Library.array(), { concurrency: 'share' }),

    /** All playable items (movies + episodes). */
    items: (library?: LibraryId) =>
      ctx.get('/items', MediaItem.array(), { query: { library }, concurrency: 'share' }),

    /** Movies only (excludes episodes). */
    movies: (library?: LibraryId) =>
      ctx.get('/movies', MediaItem.array(), { query: { library }, concurrency: 'share' }),

    /** TV shows (aggregates). */
    shows: (library?: LibraryId) =>
      ctx.get('/shows', Show.array(), { query: { library }, concurrency: 'share' }),

    /** One show with its seasons + episodes. */
    show: (id: ShowId) =>
      ctx.get('/shows/:id', ShowDetail, { params: { id }, concurrency: 'share' }),

    item: (id: ItemId) =>
      ctx.get('/items/:id', MediaItem, { params: { id }, concurrency: 'share' }),

    /** "More like this": content-embedding neighbours of a title (public). */
    similar: (id: ItemId) => ctx.get('/items/:id/similar', MediaItem.array(), { params: { id } }),

    /** Zero-shot themed row: titles matching a free-text phrase (e.g. "christmas
     * movie", "action"), ranked by content-embedding similarity (public). */
    themed: (query: string) => ctx.get('/themed', MediaItem.array(), { query: { q: query } }),

    /** The generated home screen (Bearer): an ordered, server-assembled list of
     * section rails already localized and de-duplicated. Rendered generically. */
    home: () => ctx.get('/home', Section.array(), { concurrency: 'share' }),

    /** Today's "En vedette" hero for the caller (Bearer): one movie or show
     * picked server-side with a deterministic daily rotation. `null` only when
     * the catalogue is empty; clients keep a local fallback for that case. */
    featured: () => ctx.get('/home/featured', SectionItem.nullable()),

    /** AI-curated suggestions for one title's detail page (Bearer). Generated
     * lazily and cached server-side, so the first call for a title answers `null`
     * and the caller polls; an arriving section may have empty `items` when the
     * model found nothing worth showing. */
    aiSuggest: (id: ItemId) =>
      ctx.get('/items/:id/ai-suggest', Section.nullable(), { params: { id } }),

    /** Full-text catalogue search (movies, shows, episodes). Server-side
     * field-weighted, typo-tolerant ranking well suited to imperfect voice
     * transcripts. `limit` caps results (the server clamps to 60). */
    search: (query: string, opts?: { library?: LibraryId; limit?: number }) =>
      ctx.get('/search', SearchResponse, { query: { q: query, ...opts }, concurrency: 'latest' }),

    /** Every movie + show one person is credited in (cast or key crew),
     * best-known work first. `name` is a display name or the slug a person URL
     * carries; the server answers with the spelling the catalogue holds. */
    people: (name: string, opts?: { library?: LibraryId }) =>
      ctx.get('/people', PersonResponse, { query: { name, ...opts }, concurrency: 'latest' }),

    /** The person behind a credit: biography, birth, birthplace. */
    person: (name: string) => ctx.get('/people/details', PersonDetailResponse, { query: { name } }),

    scan: () => ctx.post('/scan', JobStarted),

    /** The last `tail` lines of the server log, as plain text. */
    logs: (tail = 200) => ctx.text('/logs', { query: { tail } }),

    /** The storyboard manifest. The server generates the sheet lazily, so this
     * answers `'pending'` (HTTP 202) while it is being built and `null` when the
     * item has no usable file or duration (404). */
    storyboard: async (id: ItemId): Promise<StoryboardManifest | 'pending' | null> => {
      const res = await ctx.send('/items/:id/storyboard', { params: { id } });
      if (res.status === 202) return 'pending';
      if (!res.ok) return null;
      return StoryboardManifest.parse(await res.json());
    },
  };
}

declare module '../../core/client' {
  interface Domains {
    media: ReturnType<typeof mediaApi> & ReturnType<typeof mediaUrls>;
  }
}
