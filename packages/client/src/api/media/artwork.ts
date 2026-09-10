import type { RequestContext } from '../../core/http';
import { artworkWidth } from './artwork-scale';
import type { Metadata } from './credits';
import type { ItemId, ShowId } from './ids';
import type { MediaItem, Show } from './schemas';

// A storyboard sheet and a generated subtitle are composed by the server and
// handed over as relative paths, so they reach a player through here rather than
// through a builder, and still need the credential it cannot send as a header.
const isItemBytes = (url: string) => url.startsWith('/api/items/');

const withParam = (url: string, name: string, value: string) =>
  `${url}${url.includes('?') ? '&' : '?'}${name}=${value}`;

/** Artwork URLs: resolving stored art against the server, at the size it is drawn. */
export function artworkApi(ctx: RequestContext) {
  /** Resolve a metadata image URL against the server origin, at the size it will
   * actually be shown. Cached WebP art is a relative path (`/api/images/…`, sized
   * via `?w=`); TMDB fallbacks are absolute and handed back untouched. Pass the
   * DISPLAY `width` for grids (a Samsung TV decoding a hundred full-size images
   * stutters); leave it out to get the stored master. */
  const resolve = (url?: string | null, width?: number): string | null => {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    let path = width ? withParam(url, 'w', String(artworkWidth(width))) : url;
    const held = ctx.mediaTicket();
    if (held && isItemBytes(url)) path = withParam(path, 't', held);
    return `${ctx.baseUrl}${path}`;
  };

  /** Generated SVG poster URL for a movie/episode. */
  const posterUrl = (id: ItemId) => ctx.url('/items/:id/poster', { params: { id } });

  /** Generated SVG poster URL for a show. */
  const showPosterUrl = (id: ShowId) => ctx.url('/shows/:id/poster', { params: { id } });

  return {
    resolve,
    posterUrl,
    showPosterUrl,

    /** Best poster for a movie/episode: real cached TMDB art if resolved, else
     * the generated SVG placeholder. */
    posterFor: (x: { id: ItemId; metadata?: Metadata | null }, width?: number): string =>
      resolve(x.metadata?.posterUrl, width) ?? posterUrl(x.id),

    /** Best poster for a show: real cached TMDB art if resolved, else the SVG. */
    showPosterFor: (x: Pick<Show, 'id' | 'metadata'>, width?: number): string =>
      resolve(x.metadata?.posterUrl, width) ?? showPosterUrl(x.id),

    /** Cover/backdrop art for a movie or show, or `null` when none resolved. */
    backdropFor: (x: { metadata?: Metadata | null }, width?: number): string | null =>
      resolve(x.metadata?.backdropUrl, width),

    /** Plex-style theme song for a movie or show, or `null` when none resolved.
     * Only TV shows carry one (a cached `/api/themes/<tvdb>.mp3`). */
    themeFor: (x: { metadata?: Metadata | null }): string | null => resolve(x.metadata?.themeUrl),

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
  };
}
