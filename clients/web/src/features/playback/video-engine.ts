// The source decision (direct-play vs the HLS remux master); `useVideoPlayback`
// owns the React state/effects that drive these helpers.
//
// The HLS master is remuxed from an anchor; hls.js plays it from relative 0,
// so the absolute position is `baseSec + currentTime`, where `baseSec` is the
// keyframe start the server reports rather than the anchor that was asked for.

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
  // the server's reported start back to report the absolute position.
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
