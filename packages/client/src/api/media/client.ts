import type { Query, RequestContext } from '../../core/client';
import { JobStarted } from '../jobs';
import { artworkApi } from './artwork';
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
import { type HlsAudioFilter, StoryboardManifest } from './tracks';

/** What this device can decode, for the HLS master builder.
 *
 * `copyCodecs` names the audio and `videoCodecs` the video, letting the server
 * override a stream copy it would play silent or black; omitted means no
 * declaration, an empty array means none. `copyCodecs` is read only for a copy
 * request, `videoCodecs` for every mode. `maxFrame` is the largest picture this
 * decoder accepts: a bigger source is fitted inside the nearest rung under it.
 * Both axes, because a scope frame breaks the width limit while clearing the
 * height one. */
export interface HlsMasterDeclaration {
  filter?: HlsAudioFilter;
  copyCodecs?: string[];
  videoCodecs?: string[];
  maxFrame?: { width: number; height: number };
}

const frame = (maxFrame?: { width: number; height: number }) =>
  maxFrame && maxFrame.width > 0 && maxFrame.height > 0
    ? { maxw: Math.round(maxFrame.width), maxh: Math.round(maxFrame.height) }
    : {};

/** The `?copy=&video=&maxw=&maxh=` a stream request carries: what this device can
 * decode, and the largest picture it accepts. An EMPTY codec list is itself a
 * declaration ("decode none"), which is why it is not the same as no list. */
export function streamQuery({ copyCodecs, videoCodecs, maxFrame }: HlsMasterDeclaration): Query {
  return { copy: copyCodecs, video: videoCodecs, ...frame(maxFrame) };
}

const forMode = (mode: string, declaration: HlsMasterDeclaration) =>
  mode === 'copy' ? declaration : { ...declaration, copyCodecs: undefined };

/** The catalogue: what the library holds, and the URLs that play it. */
export default function mediaApi(ctx: RequestContext) {
  const artwork = artworkApi(ctx);

  return {
    artwork,
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

    /** URL of the server's recent log lines (text/plain). */
    logsUrl: (tail = 200) => ctx.url('/logs', { query: { tail } }),

    /** Direct-play stream URL for a `<video>` src. Range requests are served. */
    streamUrl: (id: ItemId) => ctx.url('/items/:id/stream', { params: { id } }),

    /** One-file offline download: video stream-copied, every audio track copied
     * or AAC-transcoded server-side. `copyCodecs`/`videoCodecs` must distinguish
     * omitted (no preference, full copy set) from an empty array (decode none,
     * transcode everything) - collapsing the two would hand a device Dolby/AV1
     * tracks it can't decode with no fallback once offline. */
    downloadUrl: (id: ItemId, copyCodecs?: string[], videoCodecs?: string[]) =>
      ctx.url('/items/:id/download', {
        params: { id },
        query: streamQuery({ copyCodecs, videoCodecs }),
      }),

    /** HLS master playlist for one continuous remux, with the `audio` track muxed
     * in. `aac=true` transcodes it to stereo AAC for runtimes that can't decode the
     * source codec via MSE; `aac=false` stream-copies it. */
    hlsMasterUrl: (
      id: ItemId,
      aac = false,
      startSec = 0,
      audio = 0,
      declaration: HlsMasterDeclaration = {},
    ): string => {
      const clean = aac ? 'aac' : 'copy';
      const mode = declaration.filter ? `aac-${declaration.filter}` : clean;
      return ctx.url('/items/:id/hls/:mode/:anchor/:audio/index.m3u8', {
        params: {
          id,
          mode,
          anchor: Math.max(0, Math.round(startSec)),
          audio: Math.max(0, Math.round(audio)),
        },
        query: streamQuery(forMode(mode, declaration)),
      });
    },

    /** WebVTT URL for the n-th embedded subtitle track. The server extracts text
     * subtitles on demand. */
    subtitleUrl: (id: ItemId, index: number) =>
      ctx.url('/items/:id/subtitles/:index.vtt', { params: { id, index } }),

    /** Manifest endpoint for an item's storyboard. */
    storyboardUrl: (id: ItemId) => ctx.url('/items/:id/storyboard', { params: { id } }),

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
    media: ReturnType<typeof mediaApi>;
  }
}
