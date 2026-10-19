// Everything the player chrome can ask of the engine: transport, audio track,
// volume filter, speed, and the hard shutdown every exit path calls.

import type { VideoPlayer } from 'expo-video';
import { useCallback, useEffect } from 'react';
import {
  type AudioFilterMode,
  type EngineCore,
  NATIVE_SEEK_AHEAD,
  nextLoadId,
  patchCore,
  patchPlayer,
} from './types';

export interface ControlDeps {
  player: VideoPlayer;
  core: EngineCore;
  load(absSec: number): Promise<void>;
  dur: number;
  localUri?: string;
  directPlayable: boolean;
  setCur(sec: number): void;
  setAudioIndex(index: number): void;
  setFilterState(mode: AudioFilterMode): void;
  setRateState(rate: number): void;
}

export interface Controls {
  togglePlay(): void;
  seekTo(abs: number): void;
  skip(delta: number): void;
  setAudio(index: number): void;
  setFilter(mode: AudioFilterMode): void;
  setRate(rate: number): void;
  shutdown(): void;
}

export function useEngineControls(deps: ControlDeps): Controls {
  const {
    player,
    core,
    load,
    dur,
    localUri,
    directPlayable,
    setCur,
    setAudioIndex,
    setFilterState,
    setRateState,
  } = deps;

  // With background playback + Now Playing enabled the native player can
  // outlive both the unmount and the modal dismissal, so every exit path
  // (back button, up-next, beforeRemove, unmount) calls this to silence it.
  const shutdown = useCallback(() => {
    nextLoadId(core);
    try {
      patchPlayer(player, { muted: true });
      player.pause();
    } catch {
      // Player already released.
    }
    // Detach the source so the audio session drops, not just pauses. A
    // released player throws SYNCHRONOUSLY here, so the call runs inside a
    // promise chain: both failure modes become one rejection `.catch` swallows.
    void Promise.resolve()
      .then(() => player.replaceAsync(null))
      .catch(() => undefined);
  }, [player, core]);

  useEffect(() => {
    return () => {
      shutdown();
    };
  }, [shutdown]);

  const seekTo = useCallback(
    (abs: number) => {
      const clamped = Math.max(0, Math.min(abs, dur > 0 ? dur - 1 : abs));
      if (core.mode === 'direct') {
        patchPlayer(player, { currentTime: clamped });
        patchCore(core, { elSec: clamped });
        setCur(clamped);
        return;
      }
      const pos = core.baseSec + core.elSec;
      if (clamped >= core.baseSec && clamped <= pos + NATIVE_SEEK_AHEAD) {
        patchPlayer(player, { currentTime: clamped - core.baseSec });
        patchCore(core, { elSec: clamped - core.baseSec });
        setCur(clamped);
        return;
      }
      void load(clamped);
    },
    [core, player, dur, load, setCur],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const skip = useCallback(
    (delta: number) => seekTo(core.baseSec + core.elSec + delta),
    [core, seekTo],
  );

  // Online, audio selection rides the master (path-param rendition),
  // re-anchored in place; a direct file switches modes to do it. Offline the
  // file carries every track, so selection is IN PLACE on the native player,
  // no reload at all.
  const setAudio = useCallback(
    (index: number) => {
      if (localUri) {
        const target = player.availableAudioTracks[index];
        if (!target) return;
        patchPlayer(player, { audioTrack: target });
        patchCore(core, { audioIndex: index });
        setAudioIndex(index);
        return;
      }
      if (index === core.audioIndex && core.mode === 'master') return;
      patchCore(core, { audioIndex: index, mode: 'master' });
      setAudioIndex(index);
      void load(core.baseSec + core.elSec);
    },
    [core, load, localUri, player, setAudioIndex],
  );

  // The volume filter is server DSP, so any filter forces the master; turning
  // it off returns to direct when the file is direct-playable.
  const setFilter = useCallback(
    (f: AudioFilterMode) => {
      if (localUri || f === core.filter) return;
      patchCore(core, { filter: f });
      setFilterState(f);
      patchCore(core, {
        mode: f === 'off' && directPlayable && !core.fellBack ? 'direct' : 'master',
      });
      void load(core.baseSec + core.elSec);
    },
    [core, load, directPlayable, localUri, setFilterState],
  );

  const setRate = useCallback(
    (r: number) => {
      patchPlayer(player, { playbackRate: r });
      setRateState(r);
    },
    [player, setRateState],
  );

  return { togglePlay, seekTo, skip, setAudio, setFilter, setRate, shutdown };
}
