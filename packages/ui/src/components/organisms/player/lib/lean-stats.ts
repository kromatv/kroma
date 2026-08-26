// For surfaces whose player exposes no decode counters; the web builds its own
// richer snapshot instead.

import type { AudioTrack, MediaItem, Translate } from '@kroma/core';
import type { PlayerStats } from '#ui/components/organisms/player/types';

/** Typed structurally so React Native surfaces can satisfy it with no DOM lib. */
export interface LeanStatsVideoHandle {
  videoWidth: number;
  videoHeight: number;
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
}

export interface LeanStatsInput {
  item: MediaItem;
  cur: number;
  dur: number;
  bufEnd: number | null;
  audioTracks: AudioTrack[];
  audioIndex: number;
  /** Null for native planes (AVPlay / mpv / exo / AVPlayer). */
  video: LeanStatsVideoHandle | null;
  /** The forward buffer a healthy stream keeps on THIS player, which is what
   *  the meter is read against. Defaults to ten seconds; a player whose cache
   *  window is a second and a half by design reads permanently critical against
   *  a single constant. */
  bufferTarget?: number;
  mode: string;
  t: Translate;
  extra?: NonNullable<PlayerStats['extra']>;
  meters?: NonNullable<PlayerStats['meters']>;
}

function videoCodecLabel(video: MediaItem['video']): string | undefined {
  if (!video) return undefined;
  const depth = video.bitDepth ? ` ${video.bitDepth}-bit` : '';
  const hdr = video.hdr ? ' HDR' : '';
  return `${video.codec.toUpperCase()}${depth}${hdr}`;
}

function audioFormatLabel(track: AudioTrack | undefined): string | undefined {
  if (!track) return undefined;
  const channels = track.channels ? ` ${track.channels}.0` : '';
  const lang = track.language ? ` (${track.language})` : '';
  return `${track.codec.toUpperCase()}${channels}${lang}`;
}

const LOW_BUFFER_SEC = 10;

/** Dropped frames appear only when an in-page <video> is present; the buffer is
 * a live meter rather than a row, because its history is the diagnostic. */
export function buildLeanStats(s: LeanStatsInput): PlayerStats {
  const { item, cur, dur, bufEnd, audioTracks, audioIndex, video, mode, t } = s;
  const target = s.bufferTarget ?? LOW_BUFFER_SEC;
  const selAudio = audioTracks.find((a) => a.index === audioIndex) ?? audioTracks[0];
  const vw = video?.videoWidth || item.video?.width || 0;
  const vh = video?.videoHeight || item.video?.height || 0;
  const q = video?.getVideoPlaybackQuality?.();
  const bufferAhead = bufEnd == null ? null : Math.max(0, bufEnd - cur);

  return {
    mode,
    resolution: vw && vh ? `${vw}×${vh}` : undefined,
    videoCodec: videoCodecLabel(item.video),
    audioFormat: audioFormatLabel(selAudio),
    buffer:
      bufferAhead == null ? undefined : t('stats.bufferAhead', { seconds: bufferAhead.toFixed(1) }),
    dropped: q ? `${q.droppedVideoFrames} / ${q.totalVideoFrames}` : undefined,
    meters: [
      // Dropped entirely rather than charted at zero: a backend with no buffered
      // range to report is not a backend holding nothing.
      ...(bufferAhead == null
        ? []
        : [
            {
              key: 'buffer',
              label: t('stats.buffer'),
              value: bufferAhead,
              display: t('stats.bufferAhead', { seconds: bufferAhead.toFixed(1) }),
              reference: {
                value: target,
                label: t('stats.bufferAhead', { seconds: String(target) }),
              },
            },
          ]),
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
