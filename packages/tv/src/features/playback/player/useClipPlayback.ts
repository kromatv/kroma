import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { ClipBackend, ClipEngine } from '#tv/features/playback/player/clipBackend';
import type { EngineListeners } from '#tv/features/playback/player/engine';

export interface ClipState {
  cur: number;
  dur: number;
  bufEnd: number;
  playing: boolean;
  waiting: boolean;
  ready: boolean;
  failed: boolean;
  aspect: number | undefined;
  endedNonce: number;
}

export interface ClipPlayback<E extends ClipEngine> extends ClipState {
  engineRef: RefObject<E | null>;
  surfaceNonce: number;
  attachVideo: (video: HTMLVideoElement | null) => void;
  togglePlay: () => void;
  seekTo: (sec: number) => void;
}

const START: ClipState = {
  cur: 0,
  dur: 0,
  bufEnd: 0,
  playing: false,
  waiting: true,
  ready: false,
  failed: false,
  aspect: undefined,
  endedNonce: 0,
};

const END_MARGIN_SEC = 0.5;

/** Plays `url` through the backend's clip engine from its start, and starts it
 * the first time the engine is ready. A null `url` holds the clip waiting with no
 * engine at all, which is how a trailer the server is still fetching looks. */
export function useClipPlayback<E extends ClipEngine>(
  backend: ClipBackend<E>,
  url: string | null,
): ClipPlayback<E> {
  const engineRef = useRef<E | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [state, setState] = useState<ClipState>(START);
  const [surfaceNonce, setSurfaceNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let started = false;
    const patch = (next: Partial<ClipState>) => setState((s) => ({ ...s, ...next }));
    const listeners: EngineListeners = {
      onTime: (cur) => patch({ cur }),
      onDuration: (dur) => {
        if (dur > 0) patch({ dur });
      },
      onBuffered: (end) => patch({ bufEnd: end ?? 0 }),
      onPlay: () => patch({ playing: true, waiting: false }),
      onPause: () => patch({ playing: false }),
      onWaiting: () => patch({ waiting: true }),
      onPlaying: () => patch({ waiting: false }),
      onEnded: () => setState((s) => ({ ...s, endedNonce: s.endedNonce + 1 })),
      onError: () => patch({ failed: true, waiting: false }),
      onAspect: (aspect) =>
        patch({ aspect: aspect > 0 && Number.isFinite(aspect) ? aspect : undefined }),
      onSurfaceChange: () => setSurfaceNonce((n) => n + 1),
      onReady: () => {
        patch({ ready: true, waiting: false });
        if (started) return;
        started = true;
        engineRef.current?.play();
      },
    };
    const engine = backend.createClipEngine({ url, video, listeners });
    if (!engine) return;
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.destroy();
    };
  }, [backend, url, video]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused()) engine.play();
    else engine.pause();
  }, []);

  const seekTo = useCallback((sec: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const total = engine.duration();
    const target = Math.max(0, total > 0 ? Math.min(total - END_MARGIN_SEC, sec) : sec);
    setState((s) => ({ ...s, cur: target }));
    engine.seekTo(target);
  }, []);

  return { ...state, engineRef, surfaceNonce, attachVideo: setVideo, togglePlay, seekTo };
}
