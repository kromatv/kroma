import type { KromaClient } from '@kromatv/client';
import type { ArrivalStallStep } from '@kromatv/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWatchEngine, watchSurface } from '#tv/features/playback/player/backend';
import { detectTvEnv } from '#tv/features/playback/player/detectTvEnv';
import type {
  EngineListeners,
  Surface,
  TvEngine,
  WatchMedia,
} from '#tv/features/playback/player/engine';
import { useSeekGesture } from '#tv/features/playback/player/useSeekGesture';

export interface WatchPlayback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  objectRef: React.RefObject<HTMLObjectElement | null>;
  engineRef: React.RefObject<TvEngine | null>;
  surface: Surface;
  surfaceNonce: number;
  ready: boolean;
  playing: boolean;
  waiting: boolean;
  failed: boolean;
  wanted: boolean;
  started: boolean;
  cur: number;
  dur: number;
  bufEnd: number | null;
  bufferedEnd: () => number;
  anchor: number;
  aspect: number | undefined;
  endedNonce: number;
  rate: number;
  togglePlay: () => void;
  setRate: (rate: number) => void;
  seekTo: (absSec: number) => void;
  skip: (delta: number) => void;
  reopen: (step: ArrivalStallStep, atSec: number) => void;
  seekPreview: number | null;
  scrub: (absSec: number) => void;
  scrubCommit: () => void;
}

export function useWatchPlayback(
  client: KromaClient,
  media: WatchMedia,
  startSec = 0,
): WatchPlayback {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);
  const engineRef = useRef<TvEngine | null>(null);
  const surface = useMemo(watchSurface, []);
  const env = useMemo(detectTvEnv, []);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [wanted, setWanted] = useState(true);
  const [started, setStarted] = useState(false);
  const [cur, setCur] = useState(startSec);
  const [anchor, setAnchor] = useState(startSec);
  const [dur, setDur] = useState(media.durationSec);
  const [bufEnd, setBufEnd] = useState<number | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [surfaceNonce, setSurfaceNonce] = useState(0);
  const [endedNonce, setEndedNonce] = useState(0);
  const [rate, setRateState] = useState(1);
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const resumeAtRef = useRef(startSec);

  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => setElement(videoRef.current));

  useEffect(() => {
    const listeners: EngineListeners = {
      onTime: (seconds) => {
        setCur(seconds);
        const engine = engineRef.current;
        if (engine) setAnchor(engine.anchor());
      },
      onDuration: (seconds) => {
        if (seconds > 0) setDur(seconds);
      },
      onBuffered: setBufEnd,
      onPlay: () => {
        setPlaying(true);
        setWaiting(false);
        setWanted(true);
      },
      onPause: () => setPlaying(false),
      onWaiting: () => setWaiting(true),
      onPlaying: () => {
        setWaiting(false);
        setStarted(true);
      },
      onEnded: () => {
        setPlaying(false);
        setEndedNonce((n) => n + 1);
      },
      onError: () => setFailed(true),
      onAspect: (ratio) => setAspect(ratio > 0 && Number.isFinite(ratio) ? ratio : undefined),
      onSurfaceChange: () => setSurfaceNonce((n) => n + 1),
      onReady: () => {
        setReady(true);
        setFailed(false);
        engineRef.current?.setRate?.(rateRef.current);
        engineRef.current?.play();
      },
    };
    const engine = createWatchEngine({
      client,
      media,
      startSec: resumeAtRef.current,
      dom: { video: element, nativeHls: env.nativeHls },
      listeners,
    });
    if (!engine) return;
    engineRef.current = engine;
    return () => {
      resumeAtRef.current = engine.position();
      engineRef.current = null;
      engine.destroy();
    };
  }, [client, media, env.nativeHls, element]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const paused = engine.isPaused();
    setWanted(paused);
    if (paused) engine.play();
    else engine.pause();
  }, []);

  const bufferedEnd = useCallback(() => {
    const end = engineRef.current?.bufferedEnd() ?? null;
    return end === null || end <= 0 ? Number.NaN : end;
  }, []);

  const reopen = useCallback((step: ArrivalStallStep, atSec: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    setFailed(false);
    setWaiting(true);
    if (step === 'reload' && engine.reload) engine.reload(atSec);
    else engine.restart(atSec);
  }, []);

  const setRate = useCallback((next: number) => {
    setRateState(next);
    engineRef.current?.setRate?.(next);
  }, []);

  const runtime = useCallback(() => engineRef.current?.duration() || dur, [dur]);

  const seekTo = useCallback(
    (absSec: number) => {
      const total = runtime();
      const target = Math.max(0, total > 0 ? Math.min(total - 0.5, absSec) : absSec);
      setCur(target);
      engineRef.current?.seekTo(target);
    },
    [runtime],
  );

  const skip = useCallback(
    (delta: number) => seekTo((engineRef.current?.position() ?? 0) + delta),
    [seekTo],
  );

  const {
    preview: seekPreview,
    scrub,
    commit: scrubCommit,
  } = useSeekGesture({ duration: runtime, seekTo });

  return {
    videoRef,
    objectRef,
    engineRef,
    surface,
    surfaceNonce,
    ready,
    playing,
    waiting: waiting && !failed,
    failed,
    wanted,
    started,
    cur,
    dur,
    bufEnd,
    bufferedEnd,
    anchor,
    aspect,
    endedNonce,
    rate,
    togglePlay,
    setRate,
    seekTo,
    skip,
    reopen,
    seekPreview,
    scrub,
    scrubCommit,
  };
}
