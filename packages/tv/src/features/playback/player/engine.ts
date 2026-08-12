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
  onReady(): void;
  onAudioFilterUnavailable?(): void;
  // Only the native backend fires this: expo-video's player is a value the engine replaces (on
  // the direct→remux fallback, and on every anchored-master seek), unlike the browser engines'
  // stable DOM elements. Without it the `<VideoView>` kept rendering a released player: a
  // black, unscrubbable screen.
  onSurfaceChange?(): void;
}

/** The uniform surface the hook + UI talk to, regardless of backend. */
export interface TvEngine {
  readonly kind: 'video' | 'avplay' | 'mpv';
  play(): void;
  pause(): void;
  isPaused(): boolean;
  position(): number;
  duration(): number;
  bufferedEnd(): number;
  seekTo(absSec: number): void;
  setAudioRendition(rendition: number): void;
  // Resize the native video plane to a fraction-rect, or `null` for fullscreen. Only AVPlay/mpv
  // implement it; the HTML `<video>` engine CSS-transforms its element instead.
  setRect?(rect: PlaneRect | null): void;
  // Apply the shared audio filter in place. Only the native engines implement it, each with its
  // own DSP; the HTML engine's chrome taps its in-page element with Web Audio instead.
  setAudioFilter?(mode: AudioFilterMode): void;
  // Whether {@link setAudioFilter} actually reaches a DSP here. A backend that can't know
  // upfront answers optimistically and corrects itself later through
  // `onAudioFilterUnavailable`.
  audioFilterSupported?(): boolean;
  destroy(): void;
}

/** Which surface an engine renders through. Derived from {@link TvEngine} so the
 * two backends cannot drift from the engines they actually build. */
export type Surface = TvEngine['kind'];

/** The audio-relative rendition to select for the chosen track, resolved from
 * a stable identity so a reordered track list still picks the right language.
 * Platform-neutral, so it lives here rather than in either backend half. */
export function renditionFor(item: MediaItem, audioIndex: number): number {
  const tracks = audioTracksOf(item);
  const want =
    tracks.find((t) => t.index === audioIndex) ?? tracks.find((t) => t.default) ?? tracks[0];
  if (!want) return 0;
  return resolveAudioRelativeIndex(tracks, audioTrackId(want));
}

// Tizen AVPlay typings: not in the TS lib, declared loosely.

/** One track from `getTotalTrackInfo()`. `extra_info` is a JSON string. */
export interface AvplayTrack {
  index: number;
  type: 'VIDEO' | 'AUDIO' | 'TEXT' | (string & {});
  extra_info?: string;
}

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

// Desktop mpv bridge (Tauri): the @kroma/desktop shell runs a native mpv
// process for video and exposes a command surface + event stream to the
// webview, reached through Tauri's injected `window.__TAURI__` globals, so
// @kroma/tv needs no Tauri dependency, and this path stays inert in a plain
// browser (getTauri() → null → the HTML/AVPlay engines are used instead).

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

/** Whether this bundle ships Shaka Player. The legacy tier's build defines
 * `globalThis.__KROMA_LEGACY_TIER__` to a literal `true`, which also lets the
 * html engine's shaka import fold away: the engines that tier serves fail
 * Shaka's own support check, and the inlined IIFE would carry the whole
 * library anyway. A property read, not a bare global, so every other runtime
 * (vitest, Metro, the modern shells) resolves it to a plain `undefined`. */
export function shakaAvailable(): boolean {
  return !(globalThis as { __KROMA_LEGACY_TIER__?: boolean }).__KROMA_LEGACY_TIER__;
}

/** Only the Linux desktop shell spawns mpv (the Deck's VA-API path); on macOS
 * the WKWebView decodes HEVC via VideoToolbox, so we use the in-page
 * `<video>` engine there instead of a second window. */
export function mpvAvailable(): boolean {
  if (getTauri() == null) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return true; // Deck: mpv binary
  // macOS: the in-process libmpv engine flags itself in Rust `setup` once it's up.
  return '__KROMA_MPV__' in globalThis;
}

/** The real start of an anchored master: the server seeks to the keyframe
 * at-or-before the requested anchor (`-noaccurate_seek`) and reports it via
 * the `X-Hls-Start` header. Using the requested anchor as `baseSec` would
 * drift the absolute clock by up to one GOP, desyncing the progress bar and
 * every subtitle cue after a resume/seek/audio switch. */
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
