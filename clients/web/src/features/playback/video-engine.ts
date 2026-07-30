// The `<video>` element event wiring and source decision (direct-play vs the
// HLS remux master); `useVideoPlayback` owns the React state/effects that
// drive these helpers.
//
// The HLS master is remuxed from an anchor; hls.js plays it from relative 0,
// so the absolute position is `anchor + currentTime` (see `baseSec`).

import type { AudioTrack, EngineDecision } from '@kroma/core';
import type { WebEnginePref } from '#web/features/playback/engine-pref';
import { kromaClient, type MovieView } from '#web/shared/lib/api';

export type HlsInstance = import('hls.js').default;

// hls.js defaults cap at 30s/60MB and Shaka's bufferingGoal is only 10s, both
// too stingy for the server's readrate-1.5 remux, which produces well ahead.
const FORWARD_BUFFER_SEC = 120;
const MAX_FORWARD_BUFFER_SEC = 600;
const BACK_BUFFER_SEC = 60;
const MAX_BUFFER_BYTES = 500 * 1000 * 1000;

/** The subset of Shaka's live `getStats()` snapshot the stats panel reads; bandwidth
 * is bits/s, times are seconds. */
export interface ShakaStatsLike {
  streamBandwidth: number;
  estimatedBandwidth: number;
  stallsDetected: number;
  bufferingTime: number;
  bytesDownloaded: number;
  currentCodecs: string;
  droppedFrames: number;
  decodedFrames: number;
}

/** The slice of the Shaka Player API this engine touches, typed structurally
 * rather than pulling Shaka's generated namespace types into the hook. */
export interface ShakaPlayerLike {
  attach(media: HTMLMediaElement): Promise<void>;
  load(uri: string, startTime?: number | null): Promise<void>;
  destroy(): Promise<void>;
  getStats(): ShakaStatsLike;
  configure(config: Record<string, unknown>): boolean;
}
interface ShakaStatic {
  Player: { new (): ShakaPlayerLike; isBrowserSupported(): boolean };
  polyfill: { installAll(): void };
}

export interface VideoPlayback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
  playing: boolean;
  waiting: boolean;
  ready: boolean;
  cur: number;
  dur: number;
  bufEnd: number;
  volume: number;
  muted: boolean;
  rate: number;
  fs: boolean;
  useHls: boolean;
  enginePref: WebEnginePref;
  setEnginePref: (p: WebEnginePref) => void;
  audioTracks: AudioTrack[];
  audioIndex: number;
  setAudio: (index: number) => void;
  anchor: number;
  baseSec: number;
  aac: boolean;
  hlsRef: { current: HlsInstance | null };
  shakaRef: { current: ShakaPlayerLike | null };
  scrubbing: boolean;
  setScrubbing: (v: boolean) => void;
  scrubPreview: number | null;
  scrubToClientX: (clientX: number) => void;
  commitScrub: () => void;
  hover: { x: number; t: number; w: number } | null;
  setHover: (h: { x: number; t: number; w: number } | null) => void;
  togglePlay: () => void;
  skip: (delta: number) => void;
  seekTo: (absSec: number) => void;
  getPosition: () => number;
  setVol: (val: number) => void;
  toggleMute: () => void;
  applyRate: (r: number) => void;
  toggleFullscreen: () => void;
  seekToClientX: (clientX: number) => void;
  onBarMove: (e: React.PointerEvent) => void;
}

export interface MediaEventSetters {
  setCur: (n: number) => void;
  setDur: (n: number) => void;
  setBufEnd: (n: number) => void;
  setPlaying: (b: boolean) => void;
  setWaiting: (b: boolean) => void;
  setVolume: (n: number) => void;
  setMuted: (b: boolean) => void;
  setRate: (n: number) => void;
  setReady: (b: boolean) => void;
}

/** Subscribes the media element's events to the state setters and drives a
 * resilient, ready-gated autoplay. Returns the unsubscribe cleanup. */
export function bindMediaEvents(
  v: HTMLVideoElement,
  item: MovieView,
  setters: MediaEventSetters,
  baseSec = 0,
  // Preferred over the element's `duration`, which for a growing HLS EVENT
  // playlist is only the produced edge, not the whole movie. 0 = unknown.
  knownDurationMs = 0,
): () => void {
  const {
    setCur,
    setDur,
    setBufEnd,
    setPlaying,
    setWaiting,
    setVolume,
    setMuted,
    setRate,
    setReady,
  } = setters;
  const durMs = knownDurationMs || item.durationMs || 0;
  const onTime = () => setCur(baseSec + v.currentTime);
  const onDur = () => {
    const total = durMs ? durMs / 1000 : 0;
    if (total > 0) setDur(total);
    else if (Number.isFinite(v.duration)) setDur(baseSec + v.duration);
  };
  const onProg = () =>
    setBufEnd(v.buffered.length ? baseSec + v.buffered.end(v.buffered.length - 1) : 0);
  const onPause = () => setPlaying(false);
  const onWaiting = () => setWaiting(true);
  const onPlaying = () => setWaiting(false);
  const onVol = () => {
    setVolume(v.volume);
    setMuted(v.muted);
  };
  const onRate = () => setRate(v.playbackRate);

  // Stop retrying once playback actually starts, so we never fight a real user pause.
  let started = false;
  const onReady = () => {
    setReady(true);
    if (started || !v.paused) return;
    const p = v.play();
    p?.catch(() => undefined);
  };
  const onStarted = () => {
    started = true;
    setPlaying(true);
  };

  v.addEventListener('timeupdate', onTime);
  v.addEventListener('durationchange', onDur);
  v.addEventListener('progress', onProg);
  v.addEventListener('play', onStarted);
  v.addEventListener('pause', onPause);
  v.addEventListener('waiting', onWaiting);
  v.addEventListener('playing', onPlaying);
  v.addEventListener('volumechange', onVol);
  v.addEventListener('ratechange', onRate);
  v.addEventListener('loadedmetadata', onReady);
  v.addEventListener('loadeddata', onReady);
  v.addEventListener('canplay', onReady);
  return () => {
    v.removeEventListener('timeupdate', onTime);
    v.removeEventListener('durationchange', onDur);
    v.removeEventListener('progress', onProg);
    v.removeEventListener('play', onStarted);
    v.removeEventListener('pause', onPause);
    v.removeEventListener('waiting', onWaiting);
    v.removeEventListener('playing', onPlaying);
    v.removeEventListener('volumechange', onVol);
    v.removeEventListener('ratechange', onRate);
    v.removeEventListener('loadedmetadata', onReady);
    v.removeEventListener('loadeddata', onReady);
    v.removeEventListener('canplay', onReady);
  };
}

export interface AttachSourceOptions {
  v: HTMLVideoElement;
  item: MovieView;
  decision: EngineDecision;
  useNativeHls: boolean;
  useShaka: boolean;
  startSec: number;
  audioRel: number;
  hlsRef: { current: HlsInstance | null };
  shakaRef: { current: ShakaPlayerLike | null };
  setUseHls: (b: boolean) => void;
  setReady: (b: boolean) => void;
}

function seekToAnchor(v: HTMLVideoElement, startSec: number): void {
  if (startSec <= 0.5) return;
  const apply = () => {
    if (Math.abs(v.currentTime - startSec) > 1) {
      try {
        v.currentTime = startSec;
      } catch {
        // Not ready yet; retried by the loadedmetadata listener below.
      }
    }
  };
  if (v.readyState >= 1) apply();
  else v.addEventListener('loadedmetadata', apply, { once: true });
}

/**
 * Point the media element at the right source: plain direct-play for a compatible
 * single-audio MP4, otherwise the HLS stream anchored at `startSec` with the
 * chosen audio (`audioRel`) muxed in. A resume / seek / language change re-attaches
 * (the parent remounts the element); there is no in-place audio switch.
 */
export function attachMediaSource(opts: AttachSourceOptions): () => void {
  const {
    v,
    item,
    decision,
    useNativeHls,
    useShaka,
    startSec,
    audioRel,
    hlsRef,
    shakaRef,
    setUseHls,
    setReady,
  } = opts;
  setReady(false);

  if (decision.kind === 'direct') {
    setUseHls(false);
    v.src = item.stream;
    v.preload = 'auto';
    seekToAnchor(v, startSec);
    return () => {
      v.removeAttribute('src');
      v.load();
    };
  }

  setUseHls(true);
  // Remuxed from `startSec`; hls.js plays it from relative 0 and the hook adds
  // `startSec` back to report the absolute position (see `baseSec` above).
  const url = kromaClient().hlsMasterUrl(item.id, decision.aacMaster, startSec, audioRel);
  let destroyed = false;

  // Checked before `useNativeHls`: an explicit Shaka override wins, so the choice
  // is honoured even on Safari, where native HLS would otherwise take it.
  if (useShaka) {
    // Shaka reports the same relative clock as hls.js, so `baseSec` applies here too.
    void import('shaka-player/dist/shaka-player.compiled.js').then((mod) => {
      if (destroyed) return;
      const shaka = (mod as unknown as { default: ShakaStatic }).default;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        v.src = url; // let the element's native HLS (if any) try
        return;
      }
      const player = new shaka.Player();
      shakaRef.current = player;
      // Buffer far ahead: Shaka's default bufferingGoal is only 10s.
      player.configure({
        streaming: {
          bufferingGoal: FORWARD_BUFFER_SEC,
          bufferBehind: BACK_BUFFER_SEC,
          rebufferingGoal: 4,
        },
      });
      player
        .attach(v)
        .then(() => player.load(url))
        .catch(() => undefined);
    });
    return () => {
      destroyed = true;
      void shakaRef.current?.destroy();
      shakaRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }

  if (useNativeHls) {
    v.src = url; // Safari/iOS: native HLS plays the muxed program
    v.preload = 'auto';
    return () => {
      v.removeAttribute('src');
      v.load();
    };
  }

  void import('hls.js').then(({ default: Hls }) => {
    if (destroyed) return;
    if (!Hls.isSupported()) {
      v.src = url;
      return;
    }
    // startPosition 0 is relative to the anchored stream, not absolute.
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startPosition: 0,
      maxBufferLength: FORWARD_BUFFER_SEC,
      maxMaxBufferLength: MAX_FORWARD_BUFFER_SEC,
      maxBufferSize: MAX_BUFFER_BYTES,
      backBufferLength: BACK_BUFFER_SEC,
    });
    hlsRef.current = hls;
    hls.loadSource(url);
    hls.attachMedia(v);
  });

  return () => {
    destroyed = true;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    v.removeAttribute('src');
    v.load();
  };
}
