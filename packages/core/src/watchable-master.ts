import type { HlsMasterDeclaration } from '@kromatv/client/media';
import type { WatchableFile } from '@kromatv/client/watchable';
import { decodableAudioCodecs, decodableVideoCodecs, type PlaybackCapabilities } from './hevc';
import { type BufferPlan, bufferPlan } from './playback-buffer';

export function watchableDeclaration(caps: PlaybackCapabilities): HlsMasterDeclaration {
  return {
    copyCodecs: decodableAudioCodecs(caps),
    videoCodecs: decodableVideoCodecs(caps),
  };
}

export function watchableBufferPlan(file: WatchableFile, durationMs: number | null): BufferPlan {
  const known = durationMs !== null && durationMs > 0 && file.sizeBytes > 0;
  return bufferPlan(known ? (file.sizeBytes * 8) / (durationMs / 1000) : null);
}
