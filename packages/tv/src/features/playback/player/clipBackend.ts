import type { ComponentType } from 'react';
import type { EngineListeners, TvEngine } from '#tv/features/playback/player/engine';
import type { ClipPlayback } from '#tv/features/playback/player/useClipPlayback';

/** A short clip played straight from its file, such as a trailer: the film
 * engine's transport, without tracks, resume or a server remux to fall back on.
 * Derived from {@link TvEngine} so the two cannot drift. */
export type ClipEngine = Pick<
  TvEngine,
  'play' | 'pause' | 'isPaused' | 'position' | 'duration' | 'bufferedEnd' | 'seekTo' | 'destroy'
> &
  Required<Pick<TvEngine, 'setRate'>>;

/** Everything `createClipEngine` is handed: the file, the page's `<video>` once a
 * surface has mounted one, and the callbacks the playback hook listens on. */
export interface CreateClipArgs {
  url: string;
  video: HTMLVideoElement | null;
  listeners: EngineListeners;
}

/** What a backend's clip surface is handed to draw. */
export interface ClipSurfaceProps<E extends ClipEngine> {
  clip: ClipPlayback<E>;
  title: string;
}

/** One shell's clip playback: the engine that opens a plain file, and the surface
 * it draws on. `createClipEngine` answers `null` while the surface it needs has
 * not mounted yet, and is asked again once it has. */
export interface ClipBackend<E extends ClipEngine> {
  createClipEngine(args: CreateClipArgs): E | null;
  Surface: ComponentType<ClipSurfaceProps<E>>;
}
