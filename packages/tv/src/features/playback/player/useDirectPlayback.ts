import {
  type AudioTrack,
  audioTrackLabel,
  audioTracksOf,
  type DirectPlayVerdict,
  declaredAspect,
  type KromaClient,
  type MediaItem,
  type MessageKey,
} from '@kroma/core';
import { type AudioFilterMode, type PlaneRect, usePlaybackHeartbeat, useT } from '@kroma/ui';
import { useCallback, useRef, useState } from 'react';
import type { EnginePref } from '#tv/app/enginePref';
import type { Surface, TvEngine } from '#tv/features/playback/player/engine';
import { useEngineLifecycle } from '#tv/features/playback/player/useEngineLifecycle';
import { useResumeAndPersist } from '#tv/features/playback/player/useResumeAndPersist';
import { useSeekGesture } from '#tv/features/playback/player/useSeekGesture';

export type { Surface };

export interface Playback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  engineRef: React.RefObject<TvEngine | null>;
  objectRef: React.RefObject<HTMLObjectElement | null>;
  surface: Surface;
  enginePref: EnginePref;
  setEngine: (p: EnginePref) => void;
  setPlaneRect: (rect: PlaneRect | null) => void;
  setAudioFilter: (mode: AudioFilterMode) => void;
  audioFilterSupported: boolean;
  verdict: DirectPlayVerdict | null;
  error: MessageKey | null;
  terminated: string | null;
  ready: boolean;
  playing: boolean;
  waiting: boolean;
  cur: number;
  dur: number;
  bufEnd: number | null;
  /** The picture's display ratio, from the decoder where a backend can read it
   *  and from the catalog otherwise; undefined when neither knows. */
  aspect: number | undefined;
  audioTracks: AudioTrack[];
  audioIndex: number;
  setAudio: (index: number) => void;
  togglePlay: () => void;
  seek: (delta: number) => void;
  seekTo: (absSec: number) => void;
  getPosition: () => number;
  seekScrub: (absSec: number) => void;
  seekScrubCommit: () => void;
  seekPreview: number | null;
  endedNonce: number;
  seekNonce: number;
  surfaceNonce: number;
}

/**
 * Play a media item on the TV: a compatible MP4 direct-plays in `<video>`, everything
 * else uses the complete-VOD HLS master. Resume and progress are persisted.
 */
export function useDirectPlayback(
  client: KromaClient,
  item: MediaItem,
  audioLanguage?: string | null,
): Playback {
  const t = useT();
  const objectRef = useRef<HTMLObjectElement>(null);
  const engine = useEngineLifecycle(client, item, audioLanguage);
  const {
    videoRef,
    engineRef,
    surface,
    playbackMode,
    deviceLabel,
    durationSec,
    audioIndex,
    setAudioIndex,
    setCur,
    playing,
    waiting,
    endedNonce,
  } = engine;

  const [terminated, setTerminated] = useState<string | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);

  const audioTracks = audioTracksOf(item);

  const getPosition = useCallback(() => engineRef.current?.position() ?? 0, [engineRef]);
  const setPlaneRect = useCallback(
    (rect: PlaneRect | null) => {
      engineRef.current?.setRect?.(rect);
    },
    [engineRef],
  );
  const setAudioFilter = useCallback(
    (mode: AudioFilterMode) => {
      engineRef.current?.setAudioFilter?.(mode);
    },
    [engineRef],
  );
  const runtime = useCallback(
    () => engineRef.current?.duration() || durationSec,
    [engineRef, durationSec],
  );

  useResumeAndPersist(client, item, {
    getPosition,
    getDuration: runtime,
    paused: !playing,
    endedNonce,
  });

  usePlaybackHeartbeat({
    client,
    enabled: client.hasAuth,
    eventsToken: () => client.sessionToken,
    itemId: item.id,
    durationMs: item.durationMs ?? null,
    getPosition,
    getState: () => {
      if (!playing) return 'paused';
      return waiting ? 'buffering' : 'playing';
    },
    getAudio: () =>
      audioTrackLabel(
        t,
        audioTracks.find((a) => a.index === audioIndex),
      ),
    pingSignal: `${playing}|${waiting}|${audioIndex}`,
    mode: playbackMode,
    player: 'KROMA TV',
    device: deviceLabel,
    eventsBaseUrl: client.baseUrl,
    idPrefix: 'tv',
    onTerminated: (message) => {
      engineRef.current?.pause();
      setTerminated(message.trim() || '');
    },
  });

  const togglePlay = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isPaused()) e.play();
    else e.pause();
  }, [engineRef]);

  const clamp = useCallback(
    (target: number) => {
      const total = runtime();
      return Math.max(0, total > 0 ? Math.min(total - 0.5, target) : target);
    },
    [runtime],
  );

  const seekTo = useCallback(
    (absSec: number) => {
      const target = clamp(absSec);
      // The gesture drops its preview on commit, so without this the bar snaps back to
      // the old `cur` for a whole HLS re-anchor. Safe: a replaced player's timeUpdates
      // are dropped.
      setCur(target);
      engineRef.current?.seekTo(target);
      setSeekNonce((n) => n + 1);
    },
    [clamp, engineRef, setCur],
  );

  const seek = useCallback((delta: number) => seekTo(getPosition() + delta), [seekTo, getPosition]);

  const {
    preview: seekPreview,
    scrub: seekScrub,
    commit: seekScrubCommit,
  } = useSeekGesture({ duration: runtime, seekTo });

  const setAudio = useCallback(
    (index: number) => setAudioIndex((c) => (c === index ? c : index)),
    [setAudioIndex],
  );

  return {
    videoRef,
    objectRef,
    engineRef,
    surface,
    enginePref: engine.enginePref,
    setEngine: engine.setEngine,
    setPlaneRect,
    setAudioFilter,
    audioFilterSupported: engine.audioFilterSupported,
    verdict: engine.verdict,
    error: engine.error,
    terminated,
    ready: engine.ready,
    playing,
    waiting,
    cur: engine.cur,
    dur: engine.dur,
    bufEnd: engine.bufEnd,
    aspect: engine.decodedAspect ?? declaredAspect(item),
    audioTracks,
    audioIndex,
    setAudio,
    togglePlay,
    seek,
    seekTo,
    getPosition,
    seekScrub,
    seekScrubCommit,
    seekPreview,
    endedNonce,
    seekNonce,
    surfaceNonce: engine.surfaceNonce,
  };
}
