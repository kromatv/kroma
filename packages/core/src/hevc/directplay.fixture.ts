import type { AudioTrack, MediaItem } from '@kroma/client';

export function track(p: Partial<AudioTrack> & { index: number }): AudioTrack {
  return {
    index: p.index,
    codec: p.codec ?? 'aac',
    channels: p.channels ?? null,
    language: p.language ?? null,
    title: p.title ?? null,
    default: p.default ?? false,
  };
}

export function makeItem(p: {
  container?: string;
  videoCodec?: string;
  bitDepth?: number;
  audio: AudioTrack[];
}): MediaItem {
  return {
    container: p.container ?? 'mp4',
    video: { codec: p.videoCodec ?? 'h264', bitDepth: p.bitDepth ?? 8 },
    audio: p.audio[0] ?? null,
    audioTracks: p.audio,
    durationMs: 1000,
  } as unknown as MediaItem;
}

export const EN_51 = (index: number) =>
  track({ index, language: 'en', channels: 6, codec: 'eac3' });
export const FR_51 = (index: number) =>
  track({ index, language: 'fr', channels: 6, codec: 'eac3' });
export const FR_COMMENTARY = (index: number) =>
  track({ index, language: 'fr', title: 'Commentary', channels: 2, codec: 'aac' });

export const UNPROBED = {
  video: { codec: 'h264', bitDepth: 8 },
  audio: null,
  audioTracks: [],
  durationMs: 1000,
} as unknown as MediaItem;
