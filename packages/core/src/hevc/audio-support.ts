import type { AudioTrack, MediaItem } from '@kroma/client';
import type { MessageKey, TVars } from '../i18n';
import { capabilities, type PlaybackCapabilities } from './capabilities';
import { canDirectPlay } from './directplay';

/** Browsers cannot decode AC3/EAC3/DTS/TrueHD, which plays as video with no
 * sound; `messageKey` is null when audio plays fine. */
export interface AudioSupport {
  canPlay: boolean;
  messageKey: MessageKey | null;
  messageVars?: TVars;
}

export function audioSupport(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): AudioSupport {
  const codec = item.audio?.codec;
  if (!codec) return { canPlay: true, messageKey: null };
  if (canDecodeAudioCodec(codec, caps)) return { canPlay: true, messageKey: null };
  return {
    canPlay: false,
    messageKey: 'player.audioUnsupported',
    messageVars: { codec: codec.toUpperCase() },
  };
}

/** Audio codecs ffmpeg can stream-copy into the fMP4 HLS variant, preserving
 * surround; others (DTS/TrueHD/FLAC/Opus) fall back to a stereo-AAC transcode. */
export const FMP4_COPY_CODECS = new Set<string>(['aac', 'ac3', 'eac3']);

/** Falls back to a single track for older payloads that only carry the
 * representative `audio`. */
export function audioTracksOf(item: MediaItem): AudioTrack[] {
  if (item.audioTracks?.length) return item.audioTracks;
  return item.audio ? [{ ...item.audio, index: item.audio.index ?? 0 }] : [];
}

/** Unknown codecs are assumed decodable. */
export function canDecodeAudioCodec(
  codec: string | undefined,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  if (!codec) return true;
  const known = Object.entries(caps.audio).find(([name]) => name === codec);
  return known === undefined || known[1];
}

/** Whether the single-stream HLS master can carry every audio track as an
 * alternate rendition, making language switches in-place. */
export function canSeamlessAudioSwitch(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  if (!canDirectPlay(item, caps).canDirectPlay) return false;
  return audioTracksOf(item).length > 1;
}

/**
 * For a master stream, whether audio must be transcoded to stereo AAC (true) or
 * can be stream-copied (false). Copy preserves surround and needs EVERY track to
 * be natively decodable and fMP4-copy-safe here. Unprobed audio must be AAC:
 * stream-copying a codec the browser cannot decode stalls the load on
 * `HAVE_NOTHING`.
 */
export function masterNeedsAac(
  item: MediaItem,
  caps: PlaybackCapabilities = capabilities(),
): boolean {
  const tracks = audioTracksOf(item);
  if (tracks.length === 0) return true;
  return !tracks.every(
    (t) => !!t.codec && canDecodeAudioCodec(t.codec, caps) && FMP4_COPY_CODECS.has(t.codec),
  );
}

/**
 * Track selection must key off this, never the array order: the server can serve
 * `item.audioTracks` in a different order than the player last saw.
 */
export interface AudioTrackId {
  index: number;
  language: string | null;
  title: string | null;
  channels: number | null;
}

export function audioTrackId(t: AudioTrack): AudioTrackId {
  return {
    index: t.index,
    language: t.language ?? null,
    title: t.title ?? null,
    channels: t.channels ?? null,
  };
}

function sameIdentity(t: AudioTrack, want: AudioTrackId): boolean {
  return (
    (t.language ?? null) === want.language &&
    (t.title ?? null) === want.title &&
    (t.channels ?? null) === want.channels
  );
}

function scoreMatch(t: AudioTrack, want: AudioTrackId): number {
  let s = 0;
  const lang = t.language ?? null;
  if (want.language != null && lang != null) {
    if (lang.toLowerCase() === want.language.toLowerCase()) s += 100;
  } else if (want.language == null && lang == null) {
    s += 20;
  }
  if (want.channels != null && t.channels != null && t.channels === want.channels) s += 10;
  const tt = (t.title ?? '').trim().toLowerCase();
  const wt = (want.title ?? '').trim().toLowerCase();
  if (wt && tt && tt === wt) s += 5;
  return s;
}

/**
 * Resolve a wanted audio identity to the audio-relative index to select (what
 * `hls.audioTrack` / a Safari `video.audioTracks` slot expects), tolerating a
 * reordered track list.
 */
export function resolveAudioRelativeIndex(tracks: AudioTrack[], want: AudioTrackId): number {
  if (tracks.length === 0) return 0;

  const exact = tracks.find((t) => t.index === want.index);
  if (exact && sameIdentity(exact, want)) return exact.index;

  let best: AudioTrack | null = null;
  let bestScore = 0;
  for (const t of tracks) {
    const s = scoreMatch(t, want);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  if (best) return best.index;

  const def = tracks.find((t) => t.default);
  return def?.index ?? tracks[0]?.index ?? 0;
}
