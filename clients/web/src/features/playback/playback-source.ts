import type { AudioTrack, ItemId, VideoTrack } from '@kromatv/client/media';
import type { PlaybackMode } from '@kromatv/client/playback';
import {
  audioTracksOf,
  type BufferPlan,
  capabilities,
  declaredAspect,
  decodableVideoCodecs,
  type EngineDecision,
  itemBufferPlan,
  MSE_CAPS,
  masterNeedsAac,
  type PlayEnv,
  SAFARI_CAPS,
  type StreamNotice,
  selectEngine,
  streamNotice,
} from '@kromatv/core';
import type { WebEnginePref } from '#web/features/playback/engine-pref';
import { kromaClient, type MovieView } from '#web/shared/lib/api';

/**
 * What the player plays, as the engine needs it and no more, so a catalogue
 * item and a file still downloading drive the same player. `directUrl` mints
 * the direct-play URL with a fresh media ticket each time it is called, and is
 * null where only the HLS master can play the file.
 */
export interface PlaybackSource {
  itemId: ItemId | null;
  startSec: number;
  title: string;
  container: string;
  durationMs: number | null;
  video: VideoTrack | null;
  aspect: number | undefined;
  audioTracks: AudioTrack[];
  sizeBytes: number | null;
  directUrl: (() => string) | null;
  plan: BufferPlan;
  masterUrl: (aac: boolean, startSec: number, audio: number) => string;
  decide: (env: PlayEnv, pref: WebEnginePref, forceHls: boolean) => EngineDecision;
  notice: (mode: PlaybackMode) => StreamNotice | null;
}

function catalogueDecision(
  item: MovieView,
  env: PlayEnv,
  pref: WebEnginePref,
  forceHls: boolean,
): EngineDecision {
  if (forceHls || pref === 'remux' || pref === 'shaka') {
    return {
      kind: 'web-mse',
      aacMaster: masterNeedsAac(item, env.safari ? SAFARI_CAPS : MSE_CAPS),
    };
  }
  if (pref === 'direct') return { kind: 'direct', aacMaster: false };
  return selectEngine(item, env);
}

export function catalogueSource(item: MovieView): PlaybackSource {
  return {
    itemId: item.id,
    startSec: 0,
    title: item.title,
    container: item.container,
    durationMs: item.durationMs ?? null,
    video: item.video,
    aspect: declaredAspect(item),
    audioTracks: audioTracksOf(item),
    sizeBytes: null,
    directUrl: () => kromaClient().media.streamUrl(item.id),
    // Sized from THIS title's bitrate: a flat seconds goal that a web-dl fits in
    // asks a remux for gigabytes, and the browser answers by evicting all film.
    plan: itemBufferPlan(item),
    masterUrl: (aac, startSec, audio) =>
      kromaClient().media.hlsMasterUrl(item.id, aac, startSec, audio, {
        videoCodecs: decodableVideoCodecs(capabilities()),
      }),
    decide: (env, pref, forceHls) => catalogueDecision(item, env, pref, forceHls),
    notice: (mode) => streamNotice(item, mode),
  };
}
