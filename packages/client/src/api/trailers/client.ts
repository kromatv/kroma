import type { RequestContext } from '../../core/client';
import type { TmdbKind } from '../discovery';
import { TrailerList, TrailerPreparation } from './schemas';

/** A title's trailers, by its TMDB id, whether or not the library holds it. */
export default function trailersApi(ctx: RequestContext) {
  return {
    /** The title's trailers, best first for this viewer. */
    list: (kind: TmdbKind, tmdbId: number) =>
      ctx.get('/trailers/:kind/:tmdbId', TrailerList, { params: { kind, tmdbId } }),

    /** Start fetching one trailer, or ask how far along it is. Poll until it
     * answers `ready`. */
    prepare: (kind: TmdbKind, tmdbId: number, video: string) =>
      ctx.post('/trailers/:kind/:tmdbId/:video/prepare', TrailerPreparation, {
        params: { kind, tmdbId, video },
      }),

    /** The prepared trailer as a `<video>` src: an MP4 served with `Range`,
     * carrying the media ticket because the element cannot send a header. */
    streamUrl: (kind: TmdbKind, tmdbId: number, video: string) =>
      ctx.url('/trailers/:kind/:tmdbId/:video/stream', {
        params: { kind, tmdbId, video },
        query: { t: ctx.mediaTicket() },
      }),
  };
}

declare module '../../core/client' {
  interface Domains {
    trailers: ReturnType<typeof trailersApi>;
  }
}
