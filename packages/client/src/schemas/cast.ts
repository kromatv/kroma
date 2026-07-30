// Runtime schemas for the cast domain: driving playback on another device.
// Mirrors the Rust `kroma-domain/src/cast.rs`. A TV is a receiver; a phone or a
// browser is a sender.

import { z } from 'zod';
import { ItemId } from './ids';
import { MediaItem } from './media';

/** The catch-all keeps an older client from rejecting a state a newer receiver
 * invents. `buffering` is "playing but stalled". */
export const CastState = z
  .enum(['idle', 'playing', 'paused', 'buffering', 'unknown'])
  .catch('unknown');
export type CastState = z.infer<typeof CastState>;

/** One selectable track, indexed as the *receiver's* player numbers them: its
 * subtitle list holds AI-generated tracks the catalog item never had, so an
 * index derived from the file would pick wrong. */
export const CastTrack = z.object({ index: z.number(), label: z.string() });
export type CastTrack = z.infer<typeof CastTrack>;

/** Carries the full catalog item so a remote needs no second fetch. */
export const CastNowPlaying = z.object({
  item: MediaItem,
  positionMs: z.number(),
  durationMs: z.number().nullable().optional(),
  state: CastState,
  audioTracks: z.array(CastTrack).default([]),
  audioIndex: z.number().optional(),
  subtitles: z.array(CastTrack).default([]),
  subtitleIndex: z.number().optional(),
});
export type CastNowPlaying = z.infer<typeof CastNowPlaying>;

/** A sender currently driving a receiver: the phone or browser holding its
 * remote. */
export const CastController = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullish(),
});
export type CastController = z.infer<typeof CastController>;

/** One TV in the picker. Carries no address, no account id and no per-reader
 * field: the roster is readable by every viewer on the server, and one row is
 * broadcast to every sender. */
export const CastReceiver = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  username: z.string(),
  network: z.enum(['LAN', 'WAN']).catch('WAN'),
  nowPlaying: CastNowPlaying.optional(),
  controllers: z.array(CastController).default([]),
});
export type CastReceiver = z.infer<typeof CastReceiver>;

/** `skipNext` names no target on purpose: the receiver already knows what follows
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

/** Sequenced so a receiver that sees a command twice (the live push *and* the
 * heartbeat reply) applies it once, and acks it by number. */
export const CastCommandEnvelope = z.object({
  seq: z.number(),
  command: CastCommand,
});
export type CastCommandEnvelope = z.infer<typeof CastCommandEnvelope>;

/** Sent UP the event socket, by a receiver or a sender: hello once, then only
 * when something changes, plus an ack per order applied. */
export type CastClientMessage =
  | { type: 'cast.hello'; receiverId: string; name: string; platform: string }
  | { type: 'cast.state'; playback?: CastPlaybackReport | null }
  | { type: 'cast.ack'; seq: number }
  | { type: 'cast.control'; receiverId: string; name: string }
  | { type: 'cast.release' }
  | { type: 'cast.kick'; controllerId: string };

export interface CastPlaybackReport {
  itemId: string;
  positionMs: number;
  durationMs?: number | null;
  state: Exclude<CastState, 'unknown'>;
  audioTracks?: CastTrack[];
  audioIndex?: number;
  subtitles?: CastTrack[];
  subtitleIndex?: number;
}

/** The HTTP fallback (`POST /api/cast/announce`), used only while the socket is
 * down. Everything up to `lastAppliedSeq` leaves the server's inbox. */
export interface CastAnnounceBody {
  receiverId: string;
  name: string;
  platform: string;
  lastAppliedSeq: number;
  playback?: CastPlaybackReport;
}

/** The heartbeat reply: whatever this receiver still has to apply. `ttlSecs` is
 * the silence after which the server drops it, so the client paces itself. */
export const CastAnnounceReply = z.object({
  commands: z.array(CastCommandEnvelope),
  ttlSecs: z.number(),
});
export type CastAnnounceReply = z.infer<typeof CastAnnounceReply>;
