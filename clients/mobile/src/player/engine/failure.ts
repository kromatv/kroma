import type { VideoPlayer } from 'expo-video';
import { useCallback, useState } from 'react';
import {
  diagnosePlaybackFailure,
  nativePlaybackFailure,
  type PlaybackFailure,
} from '../playback-failure';
import { stopNativePlayer } from './shutdown';
import { type EngineCore, patchCore } from './types';

export function useEngineFailure({
  core,
  player,
  localUri,
  setReady,
  setWaiting,
  setPlaying,
}: Readonly<{
  core: EngineCore;
  player: VideoPlayer;
  localUri?: string;
  setReady(value: boolean): void;
  setWaiting(value: boolean): void;
  setPlaying(value: boolean): void;
}>) {
  const [failed, setFailed] = useState(false);
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  const clearFailure = useCallback(() => {
    setFailed(false);
    setFailure(null);
  }, []);
  const failTerminal = useCallback(
    (error: unknown, uri: string, id: number) => {
      if (!core.active || core.terminal || core.loadId !== id) return;
      patchCore(core, { terminal: true, resumeOnLoad: false, pendingSeek: null, started: false });
      stopNativePlayer(player);
      setFailed(true);
      setFailure(nativePlaybackFailure(error));
      setReady(false);
      setWaiting(false);
      setPlaying(false);
      if (localUri) return;
      void diagnosePlaybackFailure(uri, error)
        .then((diagnosed) => {
          if (core.active && core.loadId === id) setFailure(diagnosed);
        })
        .catch(() => undefined);
    },
    [core, player, localUri, setReady, setWaiting, setPlaying],
  );
  return { failed, failure, clearFailure, failTerminal };
}
