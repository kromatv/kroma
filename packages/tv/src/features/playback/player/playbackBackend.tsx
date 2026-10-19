import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import type { PlaybackCapabilities, PlayEnv } from '@kromatv/core';
import type { AudioFilterMode } from '@kromatv/ui';
import { type ComponentType, createContext, type ReactNode, use } from 'react';
import type { EnginePref } from '#tv/app/enginePref';
import type { EngineListeners, Surface, TvEngine } from '#tv/features/playback/player/engine';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';

/** What the shared playback hook reads of a resolved plan; a backend's own plan
 * may carry more for its `createTvEngine`. */
export interface EnginePlan {
  eng: string;
  surface: Surface;
  playbackMode: 'direct' | 'remux' | 'transcode';
  deviceLabel: string;
  rebuildKey: string;
}

/** Everything `createTvEngine` is handed to build an engine for a plan. */
export interface CreateEngineArgs<P extends EnginePlan = EnginePlan> {
  plan: P;
  capabilities?: PlaybackCapabilities;
  client: KromaClient;
  item: MediaItem;
  durationSec: number;
  rendition: number;
  startSec: number;
  audioFilter: AudioFilterMode;
  dom: { video: HTMLVideoElement | null; nativeHls: boolean | undefined };
  listeners: EngineListeners;
}

/** One shell's playback: how it plans and builds an engine, and the surface the
 * engine draws on. */
export interface PlaybackBackend<P extends EnginePlan = EnginePlan> {
  planEngine(
    item: MediaItem,
    env: PlayEnv,
    pref: EnginePref,
    capabilities?: PlaybackCapabilities,
  ): P;
  createTvEngine(args: CreateEngineArgs<P>): TvEngine | null;
  Surface: ComponentType<{ pb: Playback; title: string }>;
}

/** What a shell hands `TvApp` for playback: the player screen, already wired to
 * its backend, and loaded however that shell loads it. */
export interface PlaybackPlatform {
  Player: ComponentType;
}

const PlaybackBackendContext = createContext<PlaybackBackend | null>(null);

/** Puts a shell's backend under the player screen. */
export function PlaybackBackendProvider({
  value,
  children,
}: Readonly<{ value: PlaybackBackend; children: ReactNode }>): ReactNode {
  return <PlaybackBackendContext value={value}>{children}</PlaybackBackendContext>;
}

/** The backend the shell mounted the player with. */
export function usePlaybackBackend(): PlaybackBackend {
  const backend = use(PlaybackBackendContext);
  if (!backend) throw new Error('usePlaybackBackend outside a PlaybackBackendProvider');
  return backend;
}
