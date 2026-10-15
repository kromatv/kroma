import { z } from 'zod';
import { DownloadId } from './ids';

/** One file of a watch download, named the way the capability names it: the
 * `mount` that answers, the download `id` there and the `file` index in it. */
export const WatchItem = z.object({
  mount: z.string().min(1).max(256),
  id: DownloadId,
  file: z.number().int().nonnegative(),
  title: z.string().min(1).max(1024),
  poster: z.string().max(1024).nullish(),
  tmdbId: z.number().int().positive().nullish(),
  season: z.number().int().nonnegative().nullish(),
  episode: z.number().int().nonnegative().nullish(),
});
export type WatchItem = z.infer<typeof WatchItem>;
