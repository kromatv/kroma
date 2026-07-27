// Runtime schemas for the cast domain: driving playback on another device.
// Mirrors the Rust `kroma-domain/src/cast.rs`.
//
// A TV app is a **receiver** (it announces itself and applies commands); a phone
// or a browser is a **sender** (it lists receivers and posts commands). Both
// sides speak the shapes below.

import { z } from 'zod';
import { ItemId } from './ids';
import { MediaItem } from './media';

/** What a receiver is doing. `buffering` is "playing but stalled" - a sender
 * keeps showing the pause button and adds a spinner. The catch-all keeps an
 * older client from rejecting a state a newer receiver invents. */
export const CastState = z
  .enum(['idle', 'playing', 'paused', 'buffering', 'unknown'])
  .catch('unknown');
export type CastState = z.infer<typeof CastState>;

/** One selectable track, as the *receiver's* player numbers them. The receiver
 * sends its own lists: its subtitle list also holds AI-generated tracks the
 * catalog item never had, so an index derived from the file would pick wrong. */
export const CastTrack = z.object({ index: z.number(), label: z.string() });
export type CastTrack = z.infer<typeof CastTrack>;

/** What a receiver is playing, as a sender renders it: the full catalog item
 * (so a remote has the poster and title without a second fetch) plus transport. */
export const CastNowPlaying = z.object({
  item: MediaItem,
  positionMs: z.number(),
  durationMs: z.number().nullable().optional(),
  state: CastState,
  /** What the receiver's own pickers offer, and what is live on it. */
  audioTracks: z.array(CastTrack).default([]),
  audioIndex: z.number().optional(),
  subtitles: z.array(CastTrack).default([]),
  /** Absent = subtitles off. */
  subtitleIndex: z.number().optional(),
});
export type CastNowPlaying = z.infer<typeof CastNowPlaying>;

/** One TV in the picker. Carries no address and no account id: the roster is
 * readable by every viewer on the server. */
export const CastReceiver = z.object({
  id: z.string(),
  /** What the device calls itself ("Salon"). */
  name: z.string(),
  /** Platform label shown under the name ("Apple TV", "Tizen", "webOS"). */
  platform: z.string(),
  /** Profile the TV is signed into - usually not the sender's, and the thing
   * that tells two identical sets apart. The row deliberately carries no
   * per-reader field, so the server can broadcast one row to every sender
   * instead of each of them refetching the roster. */
  username: z.string(),
  network: z.enum(['LAN', 'WAN']).catch('WAN'),
  nowPlaying: CastNowPlaying.optional(),
});
export type CastReceiver = z.infer<typeof CastReceiver>;

/** An order from a sender to a receiver.
 *
 * `skipNext` names no target on purpose: the receiver already knows what follows
 * what it is playing, and resolving it sender-side would race the TV. */
export const CastCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), itemId: ItemId, positionMs: z.number().optional() }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('togglePlay') }),
  z.object({ type: z.literal('seek'), positionMs: z.number() }),
  z.object({ type: z.literal('skip'), deltaMs: z.number() }),
  z.object({ type: z.literal('skipNext') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('setAudio'), index: z.number() }),
  z.object({ type: z.literal('setSubtitle'), index: z.number().nullable() }),
]);
export type CastCommand = z.infer<typeof CastCommand>;

/** A command in flight: sequenced so a receiver that sees it twice (the live
 * push *and* the heartbeat reply) applies it once, and acks it by number. */
export const CastCommandEnvelope = z.object({
  seq: z.number(),
  command: CastCommand,
});
export type CastCommandEnvelope = z.infer<typeof CastCommandEnvelope>;

/** What a receiver sends UP its event socket - the live path, which replaced a
 * heartbeat every ten seconds. It says hello once, then speaks only when
 * something changes, and acks the orders it applies. */
export type CastClientMessage =
  | { type: 'cast.hello'; receiverId: string; name: string; platform: string }
  | { type: 'cast.state'; playback?: CastPlaybackReport | null }
  | { type: 'cast.ack'; seq: number };

/** What a receiver reports about its own playback. */
export interface CastPlaybackReport {
  itemId: string;
  positionMs: number;
  durationMs?: number | null;
  state: Exclude<CastState, 'unknown'>;
  /** This player's own track lists + selections (see {@link CastTrack}). */
  audioTracks?: CastTrack[];
  audioIndex?: number;
  subtitles?: CastTrack[];
  subtitleIndex?: number;
}

/** What a receiver reports on the HTTP fallback (`POST /api/cast/announce`),
 * used only while its socket is down. */
export interface CastAnnounceBody {
  receiverId: string;
  name: string;
  platform: string;
  /** Highest seq applied so far; everything up to it leaves the server's inbox. */
  lastAppliedSeq: number;
  /** Omitted while the TV sits on its home screen. */
  playback?: CastPlaybackReport;
}

/** The heartbeat reply: whatever this receiver still has to apply. */
export const CastAnnounceReply = z.object({
  commands: z.array(CastCommandEnvelope),
  /** Seconds of silence after which the server drops this receiver, so the
   * client paces its heartbeat off the server instead of a hardcoded guess. */
  ttlSecs: z.number(),
});
export type CastAnnounceReply = z.infer<typeof CastAnnounceReply>;
