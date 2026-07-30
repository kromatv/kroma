// Catalogue reads, art/stream URL builders and subtitles.

import type {
  Activity,
  Health,
  Library,
  MediaItem,
  Metadata,
  PersonDetailResponse,
  PersonResponse,
  SearchResponse,
  Section,
  SectionItem,
  Show,
  ShowDetail,
} from '../types';
import { KromaApiError, libraryQuery, type RequestContext } from './base';

/** Server liveness + counts. Accepts an `init` (e.g. an `AbortSignal`) so a
 * client-side heartbeat can bound the probe with a short timeout. */
export function health(ctx: RequestContext, init?: RequestInit): Promise<Health> {
  return ctx.json<Health>('/health', init);
}

export function libraries(ctx: RequestContext): Promise<Library[]> {
  return ctx.json<Library[]>('/libraries');
}

/** All playable items (movies + episodes). */
export function items(ctx: RequestContext, libraryId?: string): Promise<MediaItem[]> {
  return ctx.json<MediaItem[]>(`/items${libraryQuery(libraryId)}`);
}

/** Movies only (excludes episodes). */
export function movies(ctx: RequestContext, libraryId?: string): Promise<MediaItem[]> {
  return ctx.json<MediaItem[]>(`/movies${libraryQuery(libraryId)}`);
}

/** TV shows (aggregates). */
export function shows(ctx: RequestContext, libraryId?: string): Promise<Show[]> {
  return ctx.json<Show[]>(`/shows${libraryQuery(libraryId)}`);
}

/** One show with its seasons + episodes. */
export function show(ctx: RequestContext, id: string): Promise<ShowDetail> {
  return ctx.json<ShowDetail>(`/shows/${encodeURIComponent(id)}`);
}

export function item(ctx: RequestContext, id: string): Promise<MediaItem> {
  return ctx.json<MediaItem>(`/items/${encodeURIComponent(id)}`);
}

/** "More like this": content-embedding neighbours of a title (public). */
export function similar(ctx: RequestContext, id: string): Promise<MediaItem[]> {
  return ctx.json<MediaItem[]>(`/items/${encodeURIComponent(id)}/similar`);
}

/** Zero-shot themed row: titles matching a free-text phrase (e.g. "christmas
 * movie", "action"), ranked by content-embedding similarity (public). */
export function themed(ctx: RequestContext, query: string): Promise<MediaItem[]> {
  return ctx.json<MediaItem[]>(`/themed?q=${encodeURIComponent(query)}`);
}

/** The generated home screen (Bearer): an ordered, server-assembled list of
 * section rails (For You, "because you watched …", themed, trending, recently
 * added) already localized + de-duplicated. Clients render it generically. */
export function home(ctx: RequestContext): Promise<Section[]> {
  return ctx.json<Section[]>('/home');
}

/** Today's "En vedette" hero for the caller (Bearer): one movie or show picked
 * server-side by a multi-signal score (taste, rating, freshness, trending,
 * 4K/HDR) with a deterministic daily rotation. `null` only when the catalogue
 * is empty clients keep a local fallback for that case. */
export function featured(ctx: RequestContext): Promise<SectionItem | null> {
  return ctx.json<SectionItem | null>('/home/featured');
}

/** AI-curated suggestions for one title's detail page ("Suggestions IA"), Bearer.
 * Generated lazily by the LLM connector and cached server-side, so the first call
 * for a title returns `null` (generating) poll until a {@link Section} arrives
 * (its `items` may be empty when the model found nothing worth showing). */
export function aiSuggest(ctx: RequestContext, id: string): Promise<Section | null> {
  return ctx.json<Section | null>(`/items/${encodeURIComponent(id)}/ai-suggest`);
}

/** Full-text catalogue search (movies, shows, episodes). Server-side
 * field-weighted, typo-tolerant ranking well suited to imperfect voice
 * transcripts. `limit` caps results (the server clamps to 60). */
export function search(
  ctx: RequestContext,
  query: string,
  opts?: { libraryId?: string; limit?: number },
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.libraryId) params.set('library', opts.libraryId);
  return ctx.json<SearchResponse>(`/search?${params.toString()}`);
}

/** Every movie + show one person is credited in (cast or key crew). Server-side
 * exact (case-insensitive) match over the catalogue metadata distinct from the
 * fuzzy {@link search} ordered best-known work first. */
export function personCredits(
  ctx: RequestContext,
  name: string,
  opts?: { libraryId?: string },
): Promise<PersonResponse> {
  const params = new URLSearchParams({ name });
  if (opts?.libraryId) params.set('library', opts.libraryId);
  return ctx.json<PersonResponse>(`/people?${params.toString()}`);
}

/** The person behind a credit biography, birth, birthplace from the metadata
 * provider. Independent of {@link personCredits} (which reads the local
 * catalogue), so a person page fires both in parallel and renders the
 * filmography whether or not the provider answers. */
export function personDetails(ctx: RequestContext, name: string): Promise<PersonDetailResponse> {
  const params = new URLSearchParams({ name });
  return ctx.json<PersonDetailResponse>(`/people/details?${params.toString()}`);
}

export function scan(ctx: RequestContext): Promise<{ runId: string }> {
  return ctx.json<{ runId: string }>('/scan', { method: 'POST' });
}

/** Live scan/enrichment status snapshot. */
export function status(ctx: RequestContext): Promise<Activity> {
  return ctx.json<Activity>('/status');
}

/** URL of the server's recent log lines (text/plain). */
export function logsUrl(ctx: RequestContext, tail = 200): string {
  return `${ctx.baseUrl}/api/logs?tail=${tail}`;
}

/** Fetch the last `tail` lines of the server log as plain text. */
export async function logs(ctx: RequestContext, tail = 200): Promise<string> {
  const res = await ctx.fetchFn(logsUrl(ctx, tail));
  if (!res.ok) throw new KromaApiError(res.status, `GET /logs failed (${res.status})`);
  return res.text();
}

/** Direct-play stream URL for a `<video>` src. Range requests are served by the server. */
export function streamUrl(ctx: RequestContext, id: string): string {
  return `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/stream`;
}

/** One-file offline download: video stream-copied, every audio track copied or
 * AAC-transcoded server-side. `copyCodecs`/`videoCodecs` must distinguish
 * omitted (no preference, full copy set) from an empty array (decode none,
 * transcode everything) - collapsing the two would hand a device Dolby/AV1
 * tracks it can't decode with no fallback once offline. */
export function downloadUrl(
  ctx: RequestContext,
  id: string,
  copyCodecs?: string[],
  videoCodecs?: string[],
): string {
  const base = `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/download`;
  const params: string[] = [];
  if (copyCodecs) params.push(`copy=${encodeURIComponent(copyCodecs.join(','))}`);
  if (videoCodecs) params.push(`video=${encodeURIComponent(videoCodecs.join(','))}`);
  return params.length ? `${base}?${params.join('&')}` : base;
}

/** Server-side loudness-filter variant of the HLS master (night-mode volume
 * leveling for engines with no local audio DSP, e.g. Tizen AVPlay). The names
 * match the client Web Audio compressor modes; either one forces the AAC
 * transcode (a stream copy cannot be filtered), superseding `aac`. */
export type HlsAudioFilter = 'standard' | 'night';

/** HLS *master* playlist for one continuous remux: the video once plus EVERY
 * audio track as an alternate rendition, so language switches happen in place
 * (no reload). `aac=true` transcodes every rendition to stereo AAC for runtimes
 * that can't decode the source codec via MSE; `aac=false` stream-copies them. */
export function hlsMasterUrl(
  ctx: RequestContext,
  id: string,
  aac = false,
  startSec = 0,
  audio = 0,
  filter?: HlsAudioFilter,
): string {
  // The anchor, audio index and filter mode are all in the path, so each seek
  // position and language gets its own session with its own child URLs - no
  // collision, no stale-cache replay. Filtered and clean segments must never
  // share a URL. The chosen audio is MUXED into the stream (hls.js
  // alternate-audio switching was unreliable).
  const anchor = Math.max(0, Math.round(startSec));
  const a = Math.max(0, Math.round(audio));
  const clean = aac ? 'aac' : 'copy';
  const mode = filter ? `aac-${filter}` : clean;
  return `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/hls/${mode}/${anchor}/${a}/index.m3u8`;
}

/** Generated SVG poster URL for a movie/episode. */
export function posterUrl(ctx: RequestContext, id: string): string {
  return `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/poster`;
}

/** Generated SVG poster URL for a show. */
export function showPosterUrl(ctx: RequestContext, id: string): string {
  return `${ctx.baseUrl}/api/shows/${encodeURIComponent(id)}/poster`;
}

/** Resolve a metadata image URL against the server origin, at the size it will
 * actually be shown. Cached WebP art is a relative path (`/api/images/…`, sized
 * via `?w=`); TMDB fallbacks are absolute and handed back untouched. Pass
 * `width` for grids (a Samsung TV decoding a hundred full-size images stutters);
 * leave it out for a hero backdrop already wider than the largest bucket. */
export function resolveArt(
  ctx: RequestContext,
  url?: string | null,
  width?: number,
): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const join = url.includes('?') ? '&' : '?';
  const sized = width ? `${url}${join}w=${Math.round(width)}` : url;
  return `${ctx.baseUrl}${sized}`;
}

/** Best poster for a movie/episode: real cached TMDB art if resolved, else the
 * generated SVG placeholder. */
export function posterFor(
  ctx: RequestContext,
  x: { id: string; metadata?: Metadata | null },
  width?: number,
): string {
  return resolveArt(ctx, x.metadata?.posterUrl, width) ?? posterUrl(ctx, x.id);
}

/** Best poster for a show: real cached TMDB art if resolved, else the SVG. */
export function showPosterFor(
  ctx: RequestContext,
  x: Pick<Show, 'id' | 'metadata'>,
  width?: number,
): string {
  return resolveArt(ctx, x.metadata?.posterUrl, width) ?? showPosterUrl(ctx, x.id);
}

/** Cover/backdrop art for a movie or show, or `null` when none was resolved. */
export function backdropFor(
  ctx: RequestContext,
  x: { metadata?: Metadata | null },
  width?: number,
): string | null {
  return resolveArt(ctx, x.metadata?.backdropUrl, width);
}

/** Plex-style theme song for a movie or show, or `null` when none was resolved.
 * Only TV shows carry one (a cached `/api/themes/<tvdb>.mp3`); movies are null. */
export function themeFor(ctx: RequestContext, x: { metadata?: Metadata | null }): string | null {
  return resolveArt(ctx, x.metadata?.themeUrl);
}

/** WebVTT URL for the n-th embedded subtitle track of an item. The server
 * extracts text subtitles on demand (`GET /api/items/:id/subtitles/:n.vtt`). */
export function subtitleUrl(ctx: RequestContext, id: string, index: number): string {
  return `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/subtitles/${index}.vtt`;
}

/** Scrub-bar preview "storyboard": one sprite sheet of evenly-spaced thumbnails
 * plus the geometry needed to map a cursor time → a tile (YouTube-style hover
 * preview). Generated once per file by the server and cached on disk. */
export interface StoryboardManifest {
  url: string;
  interval: number;
  tileW: number;
  tileH: number;
  cols: number;
  rows: number;
  count: number;
  duration: number;
}

/** Manifest endpoint for an item's storyboard. */
export function storyboardUrl(ctx: RequestContext, id: string): string {
  return `${ctx.baseUrl}/api/items/${encodeURIComponent(id)}/storyboard`;
}

/** Fetch the storyboard manifest. The server generates the sheet lazily, so this
 * returns `'pending'` (HTTP 202) while it is being built the caller polls and
 * `null` when the item has no usable file/duration (404). */
export async function storyboard(
  ctx: RequestContext,
  id: string,
): Promise<StoryboardManifest | 'pending' | null> {
  const res = await ctx.fetchFn(storyboardUrl(ctx, id));
  if (res.status === 202) return 'pending';
  if (!res.ok) return null;
  return (await res.json()) as StoryboardManifest;
}
