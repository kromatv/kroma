import type { PlaybackMode } from '@kromatv/client/playback';

export interface PlayedStream {
  mode: PlaybackMode;
  aac: boolean;
}

const AUDIO_MODES = ['copy', 'aac', 'aac-standard', 'aac-night'] as const;

/** What `X-Hls-Mode` says a playlist really came back in, which is not always
 * what was asked for. Null for a header naming no mode, so the caller keeps
 * what it asked for. */
export function playedStream(hlsMode: string | null | undefined): PlayedStream | null {
  const named = hlsMode?.trim();
  if (!named) return null;
  const audio = AUDIO_MODES.find((mode) => named === mode || named.endsWith(`-${mode}`));
  if (!audio) return null;
  return { mode: named === 'copy' ? 'remux' : 'transcode', aac: audio !== 'copy' };
}
