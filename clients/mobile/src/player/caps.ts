// Static playback capabilities of the two mobile runtimes and the pure
// direct-vs-master source decision, built on the shared @kroma/core direct-play
// primitives (same model as packages/core/src/hevc/directplay.ts selectEngine).
//
// iOS drives AVPlayer, Android drives ExoPlayer (both via expo-video). Like the
// TV engines, the decision is optimistic: a direct attempt that the decoder
// rejects falls back to the HLS master at the same position (engine.ts).

import {
  audioTracksOf,
  canDecodeAudioCodec,
  canDirectPlay,
  FMP4_COPY_CODECS,
  type MediaItem,
  masterNeedsAac,
  type PlaybackCapabilities,
} from '@kroma/core';
import { Platform } from 'react-native';

/** AVPlayer: HEVC/H264 hardware decode, Dolby (AC3/EAC3) native, no VP9/AV1
 * (AV1 is A17+ only; report false rather than fail opaquely), no DTS/TrueHD. */
export const IOS_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  av1: false,
  vp9: false,
  hdr: true,
  audio: {
    aac: true,
    ac3: true,
    eac3: true,
    dts: false,
    truehd: false,
    flac: true,
    opus: false,
    mp3: true,
    vorbis: false,
  },
  source: 'unknown',
};

/** ExoPlayer: wide container/codec demux; HEVC/VP9 hardware decode is ubiquitous
 * on phones, AV1 is not (pre-2023 SoCs). Dolby/DTS decoders are TV licenses
 * phones usually lack, so surround masters transcode to AAC. */
export const ANDROID_CAPS: PlaybackCapabilities = {
  hevc: true,
  hevc10bit: true,
  h264: true,
  av1: false,
  vp9: true,
  hdr: true,
  audio: {
    aac: true,
    ac3: false,
    eac3: false,
    dts: false,
    truehd: false,
    flac: true,
    opus: true,
    mp3: true,
    vorbis: true,
  },
  source: 'unknown',
};

export function mobileCaps(): PlaybackCapabilities {
  return Platform.OS === 'ios' ? IOS_CAPS : ANDROID_CAPS;
}

/** Containers AVPlayer demuxes from a plain ranged URL (no MKV, ever). */
const IOS_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'isom']);
/** Containers ExoPlayer demuxes from a plain ranged URL. */
const ANDROID_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'isom', 'mkv', 'webm', 'ts', 'm2ts']);

export interface SourceDecision {
  /** Open the original file (zero server work); else the HLS remux master. */
  direct: boolean;
  /** When on the master, whether audio must be transcoded to stereo AAC. */
  aacMaster: boolean;
}

/** The `?copy=` set for `/download`: codecs this runtime decodes natively AND
 * ffmpeg can stream-copy into fMP4. Tracks in the set keep their original bytes
 * (surround preserved); the server transcodes the rest to stereo AAC so every
 * downloaded track is guaranteed playable offline (no fallback exists there). */
export function downloadCopyCodecs(): string[] {
  const audio = mobileCaps().audio as unknown as Record<string, boolean | undefined>;
  return [...FMP4_COPY_CODECS].filter((codec) => audio[codec] === true);
}

/** Whether the ORIGINAL file can be downloaded raw (byte-identical, zero server
 * work) and still play FULLY offline: container demuxable + video decodable +
 * every audio track strictly decodable. Stricter than {@link decideSource}
 * (which may be optimistic) because offline playback has no master fallback.
 * On iOS a multi-audio file still goes through the remux: AVFoundation only
 * exposes local audio selection for alternate-grouped tracks, which ffmpeg's
 * muxer guarantees and files in the wild do not. */
export function canRawDownload(item: MediaItem): boolean {
  const caps = mobileCaps();
  const containers = Platform.OS === 'ios' ? IOS_CONTAINERS : ANDROID_CONTAINERS;
  if (!containers.has((item.container ?? '').toLowerCase())) return false;
  if (!canDirectPlay(item, caps).canDirectPlay) return false;
  const tracks = audioTracksOf(item);
  if (tracks.length === 0) return false;
  if (Platform.OS === 'ios' && tracks.length > 1) return false;
  const audio = caps.audio as unknown as Record<string, boolean | undefined>;
  return tracks.every((t) => !!t.codec && audio[t.codec] === true);
}

export function decideSource(item: MediaItem): SourceDecision {
  const caps = mobileCaps();
  const containers = Platform.OS === 'ios' ? IOS_CONTAINERS : ANDROID_CONTAINERS;
  const container = (item.container ?? '').toLowerCase();
  const aacMaster = masterNeedsAac(item, caps);
  if (!containers.has(container)) return { direct: false, aacMaster };
  if (!canDirectPlay(item, caps).canDirectPlay) return { direct: false, aacMaster };
  const tracks = audioTracksOf(item);
  if (Platform.OS === 'ios') {
    // AVPlayer offers no in-place audio selection on plain MP4s, so only a
    // single-audio file whose track decodes natively goes direct.
    if (tracks.length !== 1) return { direct: false, aacMaster };
    const def = tracks.find((t) => t.default) ?? tracks[0];
    if (!canDecodeAudioCodec(def?.codec, caps)) return { direct: false, aacMaster };
    return { direct: true, aacMaster };
  }
  // ExoPlayer: optimistic direct for any demuxable container whose video
  // decodes; an undecodable audio track hits the error fallback into the
  // AAC master.
  return { direct: true, aacMaster };
}
