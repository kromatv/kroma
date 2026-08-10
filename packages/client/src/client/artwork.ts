// Artwork URLs: resolving stored art against the server, at the size it is drawn.

import type { Metadata, Show } from '../types';
import type { RequestContext } from './base';

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
 * via `?w=`); TMDB fallbacks are absolute and handed back untouched. Pass the
 * DISPLAY `width` for grids (a Samsung TV decoding a hundred full-size images
 * stutters); leave it out to get the stored master. */
export function resolveArt(
  ctx: RequestContext,
  url?: string | null,
  width?: number,
): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const join = url.includes('?') ? '&' : '?';
  const sized = width ? `${url}${join}w=${artworkWidth(width)}` : url;
  return `${ctx.baseUrl}${sized}`;
}

// devicePixelRatio, rounded and capped at 2: a 3x phone gains nothing visible
// and a fractional ratio would defeat the server's bucketing.
function artworkRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return Math.min(2, Math.max(1, Math.round(dpr ?? 1)));
}

// The server's widest rendition bucket (`IMAGE_WIDTHS` in api/images.rs). It
// caps the ask rather than the ask being capped server-side, so two viewports
// of the same artwork mint one URL instead of two cache keys for one rendition.
const WIDEST_ARTWORK = 960;

/** The `?w=` a surface drawn `displayWidth` wide must ask for: device pixels,
 * capped at the widest rendition the server keeps, then scaled by the device's
 * artwork-quality setting. The one place a drawn size becomes a request, so
 * `resolveArt` and `sizedImageUrl` cannot drift apart. */
export function artworkWidth(displayWidth: number): number {
  const devicePixels = Math.min(displayWidth * artworkRatio(), WIDEST_ARTWORK);
  return Math.max(1, Math.round(devicePixels * artworkScale));
}

let artworkScale = 1;

/** Scale every artwork request, for the device's artwork-resolution setting.
 *
 * 1 asks for the full width {@link artworkWidth} would otherwise request. Lower
 * trades sharpness for decode time and texture memory, which is the trade a
 * television with a weak SoC wants and a desktop does not. Clamped to a range
 * where the result is still artwork: past 1 nothing is gained on a panel that
 * draws at 1x, and below a quarter a poster is mush. Process-wide: `sizedImageUrl`
 * in `@kroma/core` reads it from a free function holding no client, so one
 * process must serve one device. */
export function setArtworkScale(scale: number): void {
  artworkScale = Math.min(1, Math.max(0.25, scale));
}

/** The current artwork multiplier (the HUD and tests read it). */
export function artworkScaleValue(): number {
  return artworkScale;
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
