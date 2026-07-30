// Static playback capabilities of the two mobile runtimes, and the pure
// direct-vs-master source decision built on the shared @kroma/core direct-play
// primitives (same model as the TV engines).
//
// iOS drives AVPlayer, Android drives ExoPlayer (both via expo-video); a
// direct attempt the decoder rejects falls back to the HLS master at the same
// position (see engine.ts).

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

// AVPlayer: HEVC/H264 hardware decode, Dolby (AC3/EAC3) native, no VP9/AV1
// (AV1 is A17+ only; report false rather than fail opaquely), no DTS/TrueHD.
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

// ExoPlayer: wide container/codec demux; HEVC/VP9 hardware decode is
// ubiquitous on phones, AV1 is not (pre-2023 SoCs). Dolby/DTS decoders are TV
// licenses phones usually lack, so surround masters transcode to AAC.
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

// Containers AVPlayer demuxes from a plain ranged URL (no MKV, ever).
const IOS_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'isom']);
// Containers ExoPlayer demuxes from a plain ranged URL.
const ANDROID_CONTAINERS = new Set(['mp4', 'mov', 'm4v', 'isom', 'mkv', 'webm', 'ts', 'm2ts']);

export interface SourceDecision {
  direct: boolean;
  aacMaster: boolean;
}

/** The `?copy=` set for `/download`: codecs this runtime decodes natively AND
 * ffmpeg can stream-copy into fMP4. The rest transcode to stereo AAC
 * server-side, since offline playback has no fallback for an unplayable track. */
export function downloadCopyCodecs(): string[] {
  const audio = mobileCaps().audio as unknown as Record<string, boolean | undefined>;
  return [...FMP4_COPY_CODECS].filter((codec) => audio[codec] === true);
}

/** The `?video=` set for `/download`: video codecs this runtime decodes in
 * hardware. A source outside the set is transcoded to H.264 by the server -
 * offline has no master fallback, so an undecodable video track downloads as
 * audio under a black frame (AV1 on a pre-A17 iPhone did exactly that). */
export function downloadVideoCodecs(): string[] {
  const caps = mobileCaps();
  return (['hevc', 'h264', 'av1', 'vp9'] as const).filter((codec) => caps[codec] === true);
}

/** Whether the ORIGINAL file can be downloaded raw (byte-identical, zero
 * server work) and still play FULLY offline. Stricter than {@link decideSource}
 * because offline has no master fallback. On iOS a multi-audio file still goes
 * through the remux: AVFoundation only exposes local audio selection for
 * alternate-grouped tracks, which files in the wild do not guarantee. */
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
