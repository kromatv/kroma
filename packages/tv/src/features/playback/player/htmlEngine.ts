// HTML `<video>` backend (+ hls.js for the master), used by webOS and Tizen.
//
// The HLS remux is anchored at `baseSec` (server input `-ss`) and the element
// restarts at 0, so absolute position is `baseSec + element time`. A seek outside
// the buffered range re-anchors (reloads the master at the new offset).

import { attachDirectPlay, type KromaClient, type MediaItem } from '@kroma/core';
import {
  type EngineListeners,
  resolveMasterStart,
  type TvEngine,
} from '#tv/features/playback/player/engine';

type HlsInstance = import('hls.js').default;

// The slice of the Shaka Player API this engine touches, typed structurally so
// Shaka's generated namespace types stay out of the program (the web client's
// video-engine does the same).
interface ShakaPlayerLike {
  attach(media: HTMLMediaElement): Promise<void>;
  load(uri: string, startTime?: number | null): Promise<void>;
  destroy(): Promise<void>;
  configure(config: Record<string, unknown>): boolean;
}
interface ShakaStatic {
  Player: { new (): ShakaPlayerLike; isBrowserSupported(): boolean };
  polyfill: { installAll(): void };
}

export interface HtmlOptions {
  video: HTMLVideoElement;
  client: KromaClient;
  item: MediaItem;
  direct: boolean;
  /** Request the AAC renditions of the master (MSE can't decode AC3). */
  masterAac: boolean;
  /** Drive the MSE master through Shaka Player rather than hls.js, the default
   * everywhere Shaka ships, like the web client; `false` is the `remux`
   * preference's explicit hls.js. Native HLS (Safari/WKWebView, legacy webOS)
   * still wins over both. */
  masterShaka: boolean;
  /** Bypass MSE/hls.js: legacy webOS engines (Chromium < 99) cannot decode HEVC
   * through MSE, but the TV's media pipeline plays HLS natively. */
  forceNativeHls?: boolean;
  initialRendition: number;
  durationSec: number;
  startSec: number;
  listeners: EngineListeners;
}

export class HtmlEngine implements TvEngine {
  readonly kind = 'video';
  private readonly v: HTMLVideoElement;
  private readonly opts: HtmlOptions;
  private readonly durSec: number;
  private baseSec: number;
  private rendition: number;
  private hls: HlsInstance | null = null;
  private shaka: ShakaPlayerLike | null = null;
  private destroyed = false;
  private readonly cleanupEvents: () => void;

  constructor(opts: HtmlOptions) {
    this.opts = opts;
    this.v = opts.video;
    this.durSec = opts.durationSec;
    this.baseSec = opts.startSec;
    this.rendition = opts.initialRendition;
    const v = this.v;
    const L = opts.listeners;
    const total = opts.durationSec;

    const onTime = () => L.onTime(this.baseSec + v.currentTime);
    const onDur = () => {
      if (total > 0) L.onDuration(total);
      else if (Number.isFinite(v.duration)) L.onDuration(v.duration);
    };
    const onProg = () =>
      L.onBuffered(v.buffered.length ? this.baseSec + v.buffered.end(v.buffered.length - 1) : 0);
    const onPlay = () => L.onPlay();
    const onPause = () => L.onPause();
    const onWaiting = () => L.onWaiting();
    const onPlaying = () => L.onPlaying();
    const onEnded = () => L.onEnded();
    const onErr = () => L.onError();
    const onReady = () => L.onReady();

    const evs: [string, EventListener][] = [
      ['timeupdate', onTime],
      ['durationchange', onDur],
      ['progress', onProg],
      ['play', onPlay],
      ['pause', onPause],
      ['waiting', onWaiting],
      ['playing', onPlaying],
      ['ended', onEnded],
      ['error', onErr],
      ['loadedmetadata', onReady],
      ['loadeddata', onReady],
      ['canplay', onReady],
    ];
    for (const [t, fn] of evs) v.addEventListener(t, fn);
    this.cleanupEvents = () => {
      for (const [t, fn] of evs) v.removeEventListener(t, fn);
    };

    if (opts.direct) {
      attachDirectPlay(v, opts.client, opts.item, { autoplay: false });
      if (opts.startSec > 0.5) {
        const seekOnce = () => {
          v.currentTime = opts.startSec;
          v.removeEventListener('loadedmetadata', seekOnce);
        };
        v.addEventListener('loadedmetadata', seekOnce);
        // The <video> is reused across items: a leaked seekOnce would jump the
        // NEXT item to this offset.
        const base = this.cleanupEvents;
        this.cleanupEvents = () => {
          base();
          v.removeEventListener('loadedmetadata', seekOnce);
        };
      }
      return;
    }
    this.attachMaster();
  }

  private attachMaster(): void {
    const v = this.v;
    // The URL must carry both the anchor and the audio track: without the anchor
    // the server always starts at t=0 and the picture ignores every seek.
    const url = this.opts.client.hlsMasterUrl(
      this.opts.item.id,
      this.opts.masterAac,
      this.baseSec,
      this.rendition,
    );
    // Safari / WKWebView: prefer native HLS, whose stack decodes Dolby
    // (AC3 / E-AC3) in full surround where hls.js + MSE cannot.
    const useNative =
      this.opts.forceNativeHls === true || v.canPlayType('application/vnd.apple.mpegurl') !== '';
    // The stream really starts at the keyframe AT-OR-BEFORE the anchor; correct
    // `baseSec` from X-Hls-Start so the clock + subtitle cues don't drift a GOP.
    void resolveMasterStart(url, this.baseSec).then((realStart) => {
      if (this.destroyed) return;
      this.baseSec = realStart;
      if (useNative) {
        v.src = url;
        v.preload = 'auto';
        return;
      }
      if (this.opts.masterShaka) {
        this.attachShaka(url);
        return;
      }
      this.attachHls(url);
    });
  }

  private attachShaka(url: string): void {
    // Spelled inline (not shakaAvailable()) so the legacy IIFE build, which
    // defines the global and inlines dynamic imports, folds this to `if (true)`
    // and drops the unreachable import below: Shaka never reaches a bundle
    // whose engines cannot run it.
    if ((globalThis as { __KROMA_LEGACY_TIER__?: boolean }).__KROMA_LEGACY_TIER__) {
      this.attachHls(url);
      return;
    }
    void import('shaka-player/dist/shaka-player.compiled.js').then((mod) => {
      if (this.destroyed) return;
      const shaka = (mod as unknown as { default: ShakaStatic }).default;
      shaka.polyfill.installAll();
      // A TV Chromium Shaka rejects still plays the same master through hls.js.
      if (!shaka.Player.isBrowserSupported()) {
        this.attachHls(url);
        return;
      }
      const player = new shaka.Player();
      this.shaka = player;
      // Buffer far ahead: Shaka's default bufferingGoal is only 10s, too stingy
      // for the server's readrate-1.5 remux (the web client's numbers).
      player.configure({
        streaming: { bufferingGoal: 120, bufferBehind: 60, rebufferingGoal: 4 },
      });
      // Shaka reports the same relative clock as hls.js, so `baseSec` applies
      // unchanged.
      player
        .attach(this.v)
        .then(() => player.load(url))
        .catch(() => undefined);
    });
  }

  private attachHls(url: string): void {
    const v = this.v;
    void import('hls.js').then(({ default: Hls }) => {
      if (this.destroyed) return;
      if (!Hls.isSupported()) {
        v.src = url;
        v.preload = 'auto';
        return;
      }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, startPosition: 0 });
      this.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
    });
  }

  private reanchor(absSec: number): void {
    const wasPlaying = !this.v.paused;
    this.baseSec = absSec;
    this.hls?.destroy();
    this.hls = null;
    void this.shaka?.destroy();
    this.shaka = null;
    this.v.removeAttribute('src');
    this.attachMaster();
    if (wasPlaying) this.v.addEventListener('canplay', () => this.play(), { once: true });
  }

  play(): void {
    const p = this.v.play() as Promise<void> | undefined;
    p?.catch(() => undefined);
  }
  pause(): void {
    this.v.pause();
  }
  isPaused(): boolean {
    return this.v.paused;
  }
  position(): number {
    return this.baseSec + this.v.currentTime;
  }
  duration(): number {
    if (this.durSec > 0) return this.durSec;
    return Number.isFinite(this.v.duration) ? this.v.duration : 0;
  }
  bufferedEnd(): number {
    return this.v.buffered.length
      ? this.baseSec + this.v.buffered.end(this.v.buffered.length - 1)
      : 0;
  }

  seekTo(absSec: number): void {
    if (this.opts.direct) {
      this.v.currentTime = absSec; // direct-play timeline is absolute
      return;
    }
    const rel = absSec - this.baseSec;
    let buffered = false;
    for (let i = 0; i < this.v.buffered.length; i += 1) {
      if (rel >= this.v.buffered.start(i) - 0.1 && rel <= this.v.buffered.end(i) - 0.3) {
        buffered = true;
        break;
      }
    }
    if (rel >= 0 && buffered) {
      this.v.currentTime = rel;
      return;
    }
    this.reanchor(absSec);
  }

  setAudioRendition(rendition: number): void {
    if (rendition === this.rendition || this.opts.direct) return;
    this.rendition = rendition;
    // The audio track is muxed in by the URL (no alternate renditions), so a
    // language switch reloads the master at the current position.
    this.reanchor(this.position());
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanupEvents();
    this.hls?.destroy();
    this.hls = null;
    void this.shaka?.destroy();
    this.shaka = null;
    this.v.removeAttribute('src');
    this.v.load();
  }
}
