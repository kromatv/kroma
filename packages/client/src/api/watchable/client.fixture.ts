import type { KromaClient } from '../../kroma-client';
import type { WatchableApi } from './client';
import { DownloadId } from './ids';

export const download = DownloadId.parse('22e86113ba9a6db4');

const MOUNT = '/api/module/tv.kroma.torrents';

/** The mount a module answering `watchable` was found at, as the transport
 *  records it: the `/api` prefix is already spent. */
export const MOUNTED = '/module/tv.kroma.torrents';

export const SINTEL = {
  tmdbId: 45745,
  kind: 'movie',
  title: 'Sintel',
  year: 2010,
  season: null,
  episode: null,
} as const;

export const watch = (client: KromaClient, mount: string = MOUNT): WatchableApi =>
  client.watchable.on(mount);
