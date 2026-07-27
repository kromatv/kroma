import {
  audioTrackId,
  audioTracksOf,
  type MediaItem,
  resolveAudioRelativeIndex,
} from '@kroma/core';
import type { AudioFilterMode, PlaneRect } from '@kroma/ui';

// A thin playback-engine abstraction for the TV player so the same hook/UI can
// drive either a plain HTML `<video>` (+ hls.js) or Samsung's native AVPlay.
//
// AVPlay decodes AC3/EAC3/DTS in hardware and renders to a video plane behind the
// page, which `<video>`/MSE on Tizen cannot do, so it is the right backend for
// surround passthrough + seamless in-place audio switching. webOS and plain
// compatible MP4 stay on the HTML engine.

/** Normalised lifecycle callbacks the hook subscribes to (absolute seconds). */
export interface EngineListeners {
  onTime(sec: number): void;
  onDuration(sec: number): void;
  onBuffered(sec: number): void;
  onPlay(): void;
  onPause(): void;
  onWaiting(): void;
  onPlaying(): void;
  onEnded(): void;
  onError(): void;
  /** Metadata/decoder ready: safe to apply a resume seek and start playback. */
  onReady(): void;
  /** The audio filter turned out to be undeliverable on this surface (the
   * device has no DSP, audio is passed through untouched, or the server's
   * filtered remux failed). The chrome hides the row instead of showing a mode
   * that is doing nothing. */
  onAudioFilterUnavailable?(): void;
  /**
   * The engine swapped the object the surface renders, and the surface must be
   * re-rendered against the new one.
   *
   * Only the native backend fires this. The browser surfaces are stable DOM
   * elements the engine attaches to (`videoRef`, `objectRef`), so they never
   * change identity; expo-video's player is a value the engine OWNS and
   * REPLACES - on the direct→remux fallback, and on every seek of an anchored
   * master. Without this the `<VideoView>` kept rendering the previous player
   * after it had been released: the picture went black and stayed black, and
   * scrubbing an MKV was impossible.
   */
  onSurfaceChange?(): void;
}

/** The uniform surface the hook + UI talk to, regardless of backend. */
export interface TvEngine {
  readonly kind: 'video' | 'avplay' | 'mpv';
  play(): void;
  pause(): void;
  isPaused(): boolean;
  /** Current position in seconds. */
  position(): number;
  /** Duration in seconds (0 when unknown). */
  duration(): number;
  /** End of the buffered range in seconds. */
  bufferedEnd(): number;
  /** Seek to an ABSOLUTE position in seconds (native + instant on a VOD source). */
  seekTo(absSec: number): void;
  /** Select an audio rendition by its audio-relative index (`0:a:<index>`). */
  setAudioRendition(rendition: number): void;
  /** Resize the native video plane to a fraction-rect (or `null` = fullscreen), so
   *  the chrome can shrink it into the settings card. Only the native engines
   *  (AVPlay / mpv) implement it; the HTML `<video>` engine omits it
   *  (the chrome CSS-transforms its element instead). */
  setRect?(rect: PlaneRect | null): void;
  /** Apply the shared audio filter / volume normalizer (§7) in place. Only the
   *  native engines implement it, each with its own DSP (mpv `af` chain,
   *  AVPlay via the server's filtered remux); the
   *  HTML `<video>` engine omits it (the chrome's Web Audio graph taps its
   *  in-page element instead). */
  setAudioFilter?(mode: AudioFilterMode): void;
  /** Whether {@link setAudioFilter} actually reaches a DSP on this device.
   *  A backend that cannot know upfront answers optimistically and corrects
   *  itself later through `onAudioFilterUnavailable`. */
  audioFilterSupported?(): boolean;
  destroy(): void;
}

/** Which surface an engine renders through. Derived from {@link TvEngine} so the
 * two backends cannot drift from the engines they actually build. */
export type Surface = TvEngine['kind'];

/** The audio-relative rendition to select for the chosen track, resolved from a
 * stable identity so a reordered track list still picks the right language.
 *
 * Platform-neutral, so it lives here rather than in either backend half: it was
 * written out twice, and a fix to one copy was invisible to the other build. */
export function renditionFor(item: MediaItem, audioIndex: number): number {
  const tracks = audioTracksOf(item);
  const want =
    tracks.find((t) => t.index === audioIndex) ?? tracks.find((t) => t.default) ?? tracks[0];
  if (!want) return 0;
  return resolveAudioRelativeIndex(tracks, audioTrackId(want));
}

// ----- Tizen AVPlay typings (not in the TS lib; declared loosely) -------------

/** One track from `getTotalTrackInfo()`. `extra_info` is a JSON string. */
export interface AvplayTrack {
  index: number;
  type: 'VIDEO' | 'AUDIO' | 'TEXT' | (string & {});
  extra_info?: string;
}

/** Native AVPlay event callbacks (all optional). */
export interface AvplayListeners {
  onbufferingstart?: () => void;
  onbufferingcomplete?: () => void;
  onbufferingprogress?: (percent: number) => void;
  oncurrentplaytime?: (ms: number) => void;
  onstreamcompleted?: () => void;
  onerror?: (err: unknown) => void;
  onevent?: (type: string, data: unknown) => void;
}

export interface AvplayApi {
  open(url: string): void;
  close(): void;
  prepareAsync(onSuccess: () => void, onError: (e: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(ms: number, onSuccess?: () => void, onError?: (e: unknown) => void): void;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): string;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setStreamingProperty(kind: string, value: string): void;
  getTotalTrackInfo(): AvplayTrack[];
  setSelectTrack(type: 'AUDIO' | 'TEXT' | 'VIDEO', index: number): void;
  setSilentSubtitle(on: boolean): void;
  suspend(): void;
  restore(url: string, ms: number, state: string): void;
  setListener(listeners: AvplayListeners): void;
}

type AvplayGlobal = { webapis?: { avplay?: AvplayApi } };

/** The native AVPlay API when running on a Tizen device, else `null`. */
export function getAvplay(): AvplayApi | null {
  const w = globalThis as unknown as AvplayGlobal;
  return w.webapis?.avplay ?? null;
}

/** Whether to drive playback through native AVPlay (Tizen only). */
export function avplayAvailable(): boolean {
  return getAvplay() != null;
}

// ----- Desktop mpv bridge (Tauri) --------------------------------------------
// The @kroma/desktop shell (a Tauri app, Steam Deck the primary target) runs a
// native mpv process for video (VA-API hardware decode of HEVC + surround audio)
// and exposes a tiny command surface + event stream to the webview. We reach it
// through Tauri's injected `window.__TAURI__` globals (the shell sets
// `app.withGlobalTauri: true`), so @kroma/tv needs no Tauri dependency and this
// whole path stays inert in a plain browser (getTauri() → null → the HTML/AVPlay
// engines are used instead).

/** The slice of Tauri's global API the mpv engine uses. */
export interface TauriBridge {
  core: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };
  event: {
    listen(event: string, cb: (e: { payload: unknown }) => void): Promise<() => void>;
  };
}

/** Tauri's injected global API when running inside the Steam Deck shell, else null. */
export function getTauri(): TauriBridge | null {
  const w = globalThis as unknown as { __TAURI__?: Partial<TauriBridge> };
  const t = w.__TAURI__;
  return t?.core?.invoke && t?.event?.listen ? (t as TauriBridge) : null;
}

/** Whether to drive playback through the native mpv process. Only the LINUX desktop
 * shell spawns mpv (the Deck's VA-API path); on macOS the WKWebView decodes HEVC via
 * VideoToolbox, so there we use the in-page `<video>` engine and never spawn a second
 * (mpv) window. So mpv is gated to a Tauri shell running on Linux. */
export function mpvAvailable(): boolean {
  if (getTauri() == null) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return true; // Deck: mpv binary
  // macOS: the in-process libmpv engine flags itself in Rust `setup` once it's up.
  return '__KROMA_MPV__' in globalThis;
}

/**
 * The REAL start of an anchored master: the server seeks to the keyframe
 * at-or-before the requested anchor (`-noaccurate_seek`) and reports it via the
 * `X-Hls-Start` header on the playlist. Using the REQUESTED anchor as `baseSec`
 * drifts the absolute clock by up to one GOP (seconds!), which desyncs the
 * progress bar and every absolute-time subtitle cue after a resume/seek/audio
 * switch. The web player has always corrected this; the TV engines must too.
 * Fetching the playlist here also warms the session the engine opens next.
 */
export async function resolveMasterStart(url: string, requested: number): Promise<number> {
  if (requested <= 0.5) return 0;
  try {
    const r = await fetch(url);
    const real = Number(r.headers.get('X-Hls-Start'));
    return Number.isFinite(real) ? real : requested;
  } catch {
    return requested;
  }
}
