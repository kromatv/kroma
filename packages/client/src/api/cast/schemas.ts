import { z } from 'zod';
import { DeviceId } from '../../core/ids';
import { ItemId, MediaItem } from '../media';
import { ControllerId } from './ids';

/** The catch-all keeps an older client from rejecting a state a newer receiver
 * invents. `buffering` is "playing but stalled". */
export const CastState = z
  .enum(['idle', 'playing', 'paused', 'buffering', 'unknown'])
  .catch('unknown');
export type CastState = z.infer<typeof CastState>;

/** What a receiver may report about itself: every {@link CastState} but the one
 * that means "this client could not name it". */
export const ReportedCastState = CastState.unwrap().exclude(['unknown']);
export type ReportedCastState = z.infer<typeof ReportedCastState>;

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
  /** How far ahead the receiver's player holds, from the start of the title. */
  bufferedMs: z.number().optional(),
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
  id: ControllerId,
  name: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullish(),
});
export type CastController = z.infer<typeof CastController>;

/** One TV in the picker. Carries no address, no account id and no per-reader
 * field: the roster is readable by every viewer on the server, and one row is
 * broadcast to every sender. */
export const CastReceiver = z.object({
  id: DeviceId,
  name: z.string(),
  platform: z.string(),
  username: z.string(),
  network: z.enum(['LAN', 'WAN']).catch('WAN'),
  nowPlaying: CastNowPlaying.optional(),
  controllers: z.array(CastController).default([]),
  /** Off or out of the app, and kept by the server well enough to be brought back. */
  asleep: z.boolean().default(false),
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

/** What a receiver says it is doing. */
export const CastPlaybackReport = z.object({
  itemId: ItemId,
  positionMs: z.number(),
  durationMs: z.number().nullish(),
  bufferedMs: z.number().optional(),
  state: ReportedCastState,
  audioTracks: z.array(CastTrack).optional(),
  audioIndex: z.number().optional(),
  subtitles: z.array(CastTrack).optional(),
  subtitleIndex: z.number().optional(),
});
export type CastPlaybackReport = z.infer<typeof CastPlaybackReport>;

/** What a receiver says about reaching itself while it is on. The server keeps
 * it and derives the wake steps from it; a field the receiver cannot read is
 * left out. */
export const CastWakeHint = z.object({
  mac: z.string().optional(),
  address: z.string().optional(),
  appId: z.string().optional(),
});
export type CastWakeHint = z.infer<typeof CastWakeHint>;

/** One thing to do to bring a television back, in the order given. A step type
 * this client does not know is kept as `unknown` and skipped, so a newer server
 * can add one. */
export const CastWakeStep = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('magic'), mac: z.string() }),
    z.object({
      type: z.literal('samsung'),
      address: z.string(),
      mac: z.string().optional(),
      appId: z.string(),
    }),
    z.object({
      type: z.literal('lg'),
      address: z.string(),
      mac: z.string().optional(),
      appId: z.string(),
    }),
    z.object({ type: z.literal('knock'), address: z.string(), port: z.number() }),
    z.object({ type: z.literal('manual') }),
    z.object({ type: z.literal('unknown') }),
  ])
  .catch({ type: 'unknown' });
export type CastWakeStep = z.infer<typeof CastWakeStep>;

/** The steps for the caller to run from where it is. The server runs none. */
export const CastWakeReply = z.object({
  steps: z.array(CastWakeStep),
});
export type CastWakeReply = z.infer<typeof CastWakeReply>;

/** Sent UP the event socket, by a receiver or a sender: hello once, then only
 * when something changes, plus an ack per order applied. */
export const CastClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cast.hello'),
    receiverId: DeviceId,
    name: z.string(),
    platform: z.string(),
    wake: CastWakeHint.optional(),
  }),
  z.object({ type: z.literal('cast.state'), playback: CastPlaybackReport.nullish() }),
  z.object({ type: z.literal('cast.ack'), seq: z.number() }),
  z.object({ type: z.literal('cast.control'), receiverId: DeviceId, name: z.string() }),
  z.object({ type: z.literal('cast.release') }),
  z.object({ type: z.literal('cast.kick'), controllerId: ControllerId }),
]);
export type CastClientMessage = z.infer<typeof CastClientMessage>;

/** The HTTP fallback (`POST /api/cast/announce`), used only while the socket is
 * down. Everything up to `lastAppliedSeq` leaves the server's inbox. */
export const CastAnnounceBody = z.object({
  receiverId: DeviceId,
  name: z.string(),
  platform: z.string(),
  lastAppliedSeq: z.number(),
  playback: CastPlaybackReport.optional(),
  wake: CastWakeHint.optional(),
});
export type CastAnnounceBody = z.infer<typeof CastAnnounceBody>;

/** The heartbeat reply: whatever this receiver still has to apply. `ttlSecs` is
 * the silence after which the server drops it, so the client paces itself. */
export const CastAnnounceReply = z.object({
  commands: z.array(CastCommandEnvelope),
  ttlSecs: z.number(),
});
export type CastAnnounceReply = z.infer<typeof CastAnnounceReply>;
