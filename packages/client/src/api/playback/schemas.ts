import { z } from 'zod';
import { ItemId } from '../media';
import { PlaybackSessionId } from './ids';

export const PlaybackState = z.enum(['playing', 'paused', 'buffering']);
export type PlaybackState = z.infer<typeof PlaybackState>;

export const PlaybackMode = z.enum(['direct', 'remux', 'transcode']);
export type PlaybackMode = z.infer<typeof PlaybackMode>;

/** What a client reports on each playback heartbeat (`POST /api/playback/ping`).
 * `bufferedMs` is the absolute position the surface has buffered up to, for the
 * dashboard's seek bar; a client that cannot read its own buffer omits it. */
export const PlaybackPing = z.object({
  sessionId: PlaybackSessionId,
  itemId: ItemId,
  positionMs: z.number(),
  durationMs: z.number().nullish(),
  bufferedMs: z.number().nullish(),
  state: PlaybackState.optional(),
  mode: PlaybackMode.optional(),
  player: z.string().optional(),
  device: z.string().optional(),
  audio: z.string().optional(),
  subtitle: z.string().optional(),
});
export type PlaybackPing = z.infer<typeof PlaybackPing>;
