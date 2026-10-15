import type { WatchableApi, WatchableProbe } from '@kromatv/client/watchable';
import { MSE_CAPS, tracksNeedAac, type WatchReady, watchableBufferPlan } from '@kromatv/core';
import type { PlayerAudioTrack } from '@kromatv/ui';
import { watchDeclaration } from '#tv/features/playback/player/backend';
import type { WatchDecoder, WatchMedia } from '#tv/features/playback/player/engine';

export function watchAudioTracks(probe: WatchableProbe): PlayerAudioTrack[] {
  return probe.audio.map((track, position) => ({
    ...track,
    title: track.title ?? null,
    default: track.default ?? position === 0,
  }));
}

export function watchMedia(
  watchable: WatchableApi,
  { target, probe, ticket }: WatchReady,
  audio: number,
): WatchMedia {
  const playlist = (decoder: WatchDecoder, anchorSec: number): string =>
    watchable.hlsMasterUrl({
      id: target.entry.id,
      file: target.file.index,
      token: ticket.token,
      aac: decoder === 'mse' && tracksNeedAac(probe.audio, MSE_CAPS),
      startSec: anchorSec,
      audio,
      declaration: watchDeclaration(decoder),
    });
  return {
    playlist,
    plan: watchableBufferPlan(target.file, probe.durationMs),
    durationSec: probe.durationMs === null ? 0 : probe.durationMs / 1000,
  };
}
