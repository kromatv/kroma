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

export interface HtmlOptions {
  video: HTMLVideoElement;
  client: KromaClient;
  item: MediaItem;
  direct: boolean;
  /** Request the AAC renditions of the master (MSE can't decode AC3). */
  masterAac: boolean;
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
    });
  }

  private reanchor(absSec: number): void {
    const wasPlaying = !this.v.paused;
    this.baseSec = absSec;
    this.hls?.destroy();
    this.hls = null;
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
    this.v.removeAttribute('src');
    this.v.load();
  }
}
