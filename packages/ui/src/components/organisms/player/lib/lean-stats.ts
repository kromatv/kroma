// The lean "stats for nerds" snapshot: item metadata + the engine clock, for
// surfaces whose player exposes no decode counters (native TV planes, the
// phone's AVPlayer/ExoPlayer). The web builds its own rich snapshot from the
// in-page <video> + hls.js; everything else shares this one so the panel reads
// the same wherever it opens.

import type { AudioTrack, MediaItem, Translate } from '@kroma/core';
import type { PlayerStats } from '../types';

/** The slice of an in-page <video> the builder reads, typed structurally so
 *  React Native surfaces (no DOM lib) can pass `null` without pulling in DOM
 *  types. */
export interface LeanStatsVideoHandle {
  videoWidth: number;
  videoHeight: number;
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
}

export interface LeanStatsInput {
  item: MediaItem;
  cur: number;
  dur: number;
  bufEnd: number;
  audioTracks: AudioTrack[];
  audioIndex: number;
  /** The in-page <video> (webOS / html engine) for decode counters; null for
   *  native planes (AVPlay / mpv / exo / AVPlayer). */
  video: LeanStatsVideoHandle | null;
  mode: string;
  t: Translate;
  /** Surface-specific rows appended after the shared ones (grouped rows land
   *  in the panel's column grid; see PlayerStats.extra). */
  extra?: NonNullable<PlayerStats['extra']>;
  /** Surface-specific live series appended after the shared buffer meter (the
   *  phone's estimated bandwidth, for instance); each gets its own chart. */
  meters?: NonNullable<PlayerStats['meters']>;
}

/** Video codec label, e.g. "HEVC 10-bit HDR" (empty parts dropped). */
function videoCodecLabel(video: MediaItem['video']): string | undefined {
  if (!video) return undefined;
  const depth = video.bitDepth ? ` ${video.bitDepth}-bit` : '';
  const hdr = video.hdr ? ' HDR' : '';
  return `${video.codec.toUpperCase()}${depth}${hdr}`;
}

/** Audio format label, e.g. "EAC3 5.0 (fr)" (empty parts dropped). */
function audioFormatLabel(track: AudioTrack | undefined): string | undefined {
  if (!track) return undefined;
  const channels = track.channels ? ` ${track.channels}.0` : '';
  const lang = track.language ? ` (${track.language})` : '';
  return `${track.codec.toUpperCase()}${channels}${lang}`;
}

/** Under this many seconds of headroom, a hiccup stalls (the web's threshold). */
const LOW_BUFFER_SEC = 10;

/**
 * "Stats for nerds" (§9) from metadata alone: what the stream IS plus where the
 * clock sits, enriched with dropped frames only when an in-page <video> is
 * present. The buffer is a live METER rather than a text row - it is the one
 * number every surface can sample, and where it has BEEN is the diagnostic.
 */
export function buildLeanStats(s: LeanStatsInput): PlayerStats {
  const { item, cur, dur, bufEnd, audioTracks, audioIndex, video, mode, t } = s;
  const selAudio = audioTracks.find((a) => a.index === audioIndex) ?? audioTracks[0];
  const vw = video?.videoWidth || item.video?.width || 0;
  const vh = video?.videoHeight || item.video?.height || 0;
  const q = video?.getVideoPlaybackQuality?.();
  const bufferAhead = Math.max(0, bufEnd - cur);

  return {
    mode,
    resolution: vw && vh ? `${vw}×${vh}` : undefined,
    videoCodec: videoCodecLabel(item.video),
    audioFormat: audioFormatLabel(selAudio),
    buffer: t('stats.bufferAhead', { seconds: bufferAhead.toFixed(1) }),
    dropped: q ? `${q.droppedVideoFrames} / ${q.totalVideoFrames}` : undefined,
    meters: [
      {
        key: 'buffer',
        label: t('stats.buffer'),
        value: bufferAhead,
        display: t('stats.bufferAhead', { seconds: bufferAhead.toFixed(1) }),
        reference: {
          value: LOW_BUFFER_SEC,
          label: t('stats.bufferAhead', { seconds: String(LOW_BUFFER_SEC) }),
        },
      },
      ...(s.meters ?? []),
    ],
    extra: [
      { label: t('stats.title2'), value: item.title },
      { label: t('stats.container'), value: (item.container ?? '').toUpperCase() },
      { label: t('stats.position'), value: `${Math.floor(cur)}s / ${Math.floor(dur)}s` },
      ...(s.extra ?? []),
    ],
  };
}
