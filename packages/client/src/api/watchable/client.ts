import type { RequestContext } from '../../core/client';
import { apiErrorBody, KromaApiError, KromaSchemaError } from '../../core/http';
import { readBoundedJson, readBoundedText } from '../../core/http/body';
import { type HlsMasterDeclaration, streamQuery } from '../media/client';
import type { DownloadId } from './ids';
import {
  WatchableProbe,
  WatchableProgress,
  WatchableStart,
  type WatchableStartBody,
  WatchableStoryboard,
  WatchableTicket,
  WatchableView,
} from './schemas';

/** What starting a film answers. `timedOut` is where it stopped answering while
 * the search kept going, so the download may still appear in the listing.
 * `noIndexer` is every indexer failing, which is the server's problem and not
 * the title's; `noRelease` is indexers that looked and came back empty. */
export type WatchableStartOutcome =
  | ({ kind: 'started' } & WatchableStart)
  | { kind: 'noRelease'; message: string | null }
  | { kind: 'noIndexer'; message: string | null }
  | { kind: 'timedOut' };

/** `token` is what `ticket` minted for that same file. */
export interface WatchableMaster {
  id: DownloadId;
  file: number;
  token: string;
  aac?: boolean;
  startSec?: number;
  audio?: number;
  declaration?: HlsMasterDeclaration;
}

/** One text subtitle track of a file, by the index the probe lists it under.
 * `token` is what `ticket` minted for that same file. */
export interface WatchableSubtitleRef {
  id: DownloadId;
  file: number;
  index: number;
  token: string;
}

/** A subtitle track as far as the file has arrived: `partial` while the module
 * may still find cues in bytes not downloaded yet. */
export interface WatchableVtt {
  vtt: string;
  partial: boolean;
}

// The source leads its refusal with this when not one indexer answered: the
// point envelope behind it carries a refusal as one string.
const NO_INDEXER_ANSWERED = 'no-indexer-answered: ';

const PARTIAL_HEADER = 'X-Kroma-Partial';
const STILL_BUILDING = 202;
const GONE = 404;
const KEPT = 409;
const NO_RELEASE = 422;
const STREAM_NOT_READABLE_YET = 503;
const STOPPED_WAITING = 504;

const SUBTITLES = '/watch/:id/files/:file/subtitles/:index.vtt';
const STORYBOARD = '/watch/:id/files/:file/storyboard';

const statusOf = (cause: unknown) => (cause instanceof KromaApiError ? cause.status : null);

const refused = (status: number, path: string) =>
  new KromaApiError(status, `GET ${path} failed (${status})`);

const fromOrigin = (origin: string, url: string) =>
  /^https?:\/\//.test(url) ? url : `${origin}${url}`;

const masterMode = (aac: boolean, declaration: HlsMasterDeclaration) => {
  if (declaration.filter) return `aac-${declaration.filter}`;
  return aac ? 'aac' : 'copy';
};

const declaredFor = (mode: string, declaration: HlsMasterDeclaration) =>
  mode === 'copy' ? declaration : { ...declaration, copyCodecs: undefined };

function refusal(cause: unknown): WatchableStartOutcome {
  const said = apiErrorBody(cause).error?.trim() || null;
  if (said?.startsWith(NO_INDEXER_ANSWERED)) {
    return { kind: 'noIndexer', message: said.slice(NO_INDEXER_ANSWERED.length) || null };
  }
  return { kind: 'noRelease', message: said };
}

function watchEndpoints(at: RequestContext) {
  return {
    list: () => at.get('/watch', WatchableView),

    /** Find a release of a film or an episode and start downloading it. Slow:
     * the indexers are swept first, which can take half a minute. */
    start: async (body: WatchableStartBody): Promise<WatchableStartOutcome> => {
      try {
        return { kind: 'started', ...(await at.post('/watch/start', WatchableStart, { body })) };
      } catch (cause) {
        if (statusOf(cause) === NO_RELEASE) return refusal(cause);
        if (statusOf(cause) === STOPPED_WAITING) return { kind: 'timedOut' };
        throw cause;
      }
    },

    probe: async (id: DownloadId, file: number): Promise<WatchableProbe | 'pending'> => {
      try {
        return await at.get('/watch/:id/files/:file/probe', WatchableProbe, {
          params: { id, file },
        });
      } catch (cause) {
        if (statusOf(cause) === STREAM_NOT_READABLE_YET) return 'pending';
        throw cause;
      }
    },

    progress: (id: DownloadId, file: number, buckets: number) =>
      at.get('/watch/:id/files/:file/progress', WatchableProgress, {
        params: { id, file },
        query: { buckets },
      }),

    ticket: (id: DownloadId, file: number) =>
      at.post('/watch/:id/files/:file/ticket', WatchableTicket, { params: { id, file } }),

    subtitleUrl: ({ id, file, index, token }: Readonly<WatchableSubtitleRef>): string =>
      at.url('/watch/:id/files/:file/subtitles/:index.vtt', {
        params: { id, file, index },
        query: { t: token },
      }),

    /** The WebVTT of one text track, fetched with the file's ticket like the
     * playlist rather than with the bearer. */
    subtitles: async ({
      id,
      file,
      index,
      token,
    }: Readonly<WatchableSubtitleRef>): Promise<WatchableVtt> => {
      const res = await at.send('/watch/:id/files/:file/subtitles/:index.vtt', {
        params: { id, file, index },
        query: { t: token },
      });
      if (!res.ok) throw refused(res.status, SUBTITLES);
      return {
        vtt: await readBoundedText(res, SUBTITLES),
        partial: res.headers.get(PARTIAL_HEADER) === '1',
      };
    },

    /** The scrub-bar sheet of one file: `'pending'` until the module has begun
     * it, and null where it offers none. Its `url` comes back absolute. */
    storyboard: async (
      id: DownloadId,
      file: number,
    ): Promise<WatchableStoryboard | 'pending' | null> => {
      const res = await at.send('/watch/:id/files/:file/storyboard', { params: { id, file } });
      if (res.status === STILL_BUILDING) return 'pending';
      if (res.status === GONE) return null;
      if (!res.ok) throw refused(res.status, STORYBOARD);
      const parsed = WatchableStoryboard.safeParse(await readBoundedJson(res, STORYBOARD));
      if (!parsed.success) throw new KromaSchemaError(STORYBOARD, parsed.error.issues);
      return { ...parsed.data, url: fromOrigin(at.baseUrl, parsed.data.url) };
    },

    /** Stop a download started to be watched and erase what it fetched. False
     * where it was kept: someone is playing it, it is not a watch download, or
     * it is already gone. */
    cancel: async (id: DownloadId): Promise<boolean> => {
      try {
        await at.delete('/watch/:id', { params: { id } });
        return true;
      } catch (cause) {
        const status = statusOf(cause);
        if (status === KEPT || status === GONE) return false;
        throw cause;
      }
    },

    /** HLS master for one file. It carries the ticket token rather than the
     * account's media ticket, because the element fetching it can send neither a
     * header nor a credential of the core's. */
    hlsMasterUrl: ({
      id,
      file,
      token,
      aac = false,
      startSec = 0,
      audio = 0,
      declaration = {},
    }: Readonly<WatchableMaster>): string => {
      const mode = masterMode(aac, declaration);
      return at.url('/watch/:id/files/:file/hls/:mode/:anchor/:audio/index.m3u8', {
        params: {
          id,
          file,
          mode,
          anchor: Math.max(0, Math.round(startSec)),
          audio: Math.max(0, Math.round(audio)),
        },
        query: { ...streamQuery(declaredFor(mode, declaration)), t: token },
      });
    },
  };
}

export type WatchableApi = ReturnType<typeof watchEndpoints>;

export default function watchableApi(ctx: RequestContext) {
  return {
    /** Every route of one source, under the mount the capability listing gave
     * for it. */
    on: (mount: string): WatchableApi => watchEndpoints(ctx.at(mount)),
  };
}

declare module '../../core/client' {
  interface Domains {
    watchable: ReturnType<typeof watchableApi>;
  }
}
