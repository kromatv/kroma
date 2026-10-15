// HTML `<video>` backend (+ hls.js for the master), used by webOS and Tizen.
//
// The HLS remux is anchored at `baseSec` (server input `-ss`) and the element
// restarts at 0, so absolute position is `baseSec + element time`. A seek outside
// the buffered range re-anchors (reloads the master at the new offset).

import type { KromaClient } from '@kromatv/client';
import {
  attachDirectPlay,
  type BufferPlan,
  decodableAudioCodecs,
  decodableVideoCodecs,
  isPlayableAt,
  itemBufferPlan,
  reachableBufferEnd,
  recoverMse,
  resolveMasterStart,
  STALL_NUDGE_SEC,
} from '@kromatv/core';
import type { EngineListeners, EngineMedia, TvEngine } from '#tv/features/playback/player/engine';
import {
  bindMediaEvents,
  seekOnceOnMetadata,
  startStreamAt,
} from '#tv/features/playback/player/htmlEvents';
import { attachMseMaster, type ShakaPlayerLike } from '#tv/features/playback/player/htmlMse';

type HlsInstance = import('hls.js').default;

export interface HtmlOptions {
  video: HTMLVideoElement;
  client: KromaClient;
  media: EngineMedia;
  direct: boolean;
  /** Request the AAC renditions of the master (MSE can't decode AC3). */
  masterAac?: boolean;
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
  private readonly direct: boolean;
  private readonly durSec: number;
  private readonly plan: BufferPlan;
  private baseSec: number;
  private rendition: number;
  private hls: HlsInstance | null = null;
  private shaka: ShakaPlayerLike | null = null;
  private destroyed = false;
  private attachSeq = 0;
  private playlistUrl: string | null = null;
  private landing: (() => void) | null = null;
  private resumeOnCanPlay: (() => void) | null = null;
  private readonly cleanupEvents: () => void;

  constructor(opts: HtmlOptions) {
    this.opts = opts;
    this.v = opts.video;
    this.direct = opts.direct && opts.media.kind === 'item';
    this.durSec = opts.durationSec;
    // Sized from THIS title's bitrate: a flat seconds goal that a web-dl fits in
    // asks a remux for gigabytes, and the browser answers by evicting all film.
    this.plan = opts.media.kind === 'hls' ? opts.media.plan : itemBufferPlan(opts.media.item);
    this.baseSec = opts.startSec;
    this.rendition = opts.initialRendition;
    const v = this.v;
    this.cleanupEvents = bindMediaEvents(v, opts.listeners, opts.durationSec, () => this.baseSec);

    if (this.direct && opts.media.kind === 'item') {
      attachDirectPlay(v, opts.client, opts.media.item, { autoplay: false });
      if (opts.startSec > 0.5) {
        const events = this.cleanupEvents;
        const stopSeek = seekOnceOnMetadata(v, opts.startSec);
        this.cleanupEvents = () => {
          events();
          stopSeek();
        };
      }
      return;
    }
    this.attachMaster();
  }

  private playsHlsItself(): boolean {
    return (
      this.opts.forceNativeHls === true ||
      this.v.canPlayType('application/vnd.apple.mpegurl') !== ''
    );
  }

  private attachNative(url: string, fromSec: number): void {
    // Safari / WKWebView: prefer native HLS, whose stack decodes Dolby
    // (AC3 / E-AC3) in full surround where hls.js + MSE cannot.
    this.dropLanding();
    this.v.src = url;
    this.v.preload = 'auto';
    this.landing = startStreamAt(this.v, fromSec);
  }

  private attachPlaylist(url: string, fromSec: number): void {
    const seq = ++this.attachSeq;
    this.playlistUrl = url;
    if (this.playsHlsItself()) {
      this.attachNative(url, fromSec);
      return;
    }
    attachMseMaster({
      video: this.v,
      url,
      fromSec,
      plan: this.plan,
      shaka: this.opts.masterShaka,
      stale: () => this.destroyed || seq !== this.attachSeq,
      onShaka: (player) => {
        this.shaka = player;
      },
      onHls: (hls) => {
        this.hls = hls;
      },
      onGiveUp: () => this.reanchor(this.position()),
      onNative: () => this.attachNative(url, fromSec),
    });
  }

  private attachMaster(): void {
    const media = this.opts.media;
    const seq = ++this.attachSeq;
    // The URL must carry both the anchor and the audio track: without the anchor
    // the server always starts at t=0 and the picture ignores every seek.
    const url =
      media.kind === 'hls'
        ? media.master(this.baseSec)
        : this.opts.client.media.hlsMasterUrl(
            media.item.id,
            this.opts.masterAac === true,
            this.baseSec,
            this.rendition,
            { copyCodecs: decodableAudioCodecs(), videoCodecs: decodableVideoCodecs() },
          );
    // The stream really starts at the keyframe AT-OR-BEFORE the anchor; correct
    // `baseSec` from X-Hls-Start so the clock + subtitle cues don't drift a GOP.
    void resolveMasterStart(url, this.baseSec).then((realStart) => {
      if (this.destroyed || seq !== this.attachSeq) return;
      this.baseSec = realStart;
      this.attachPlaylist(url, 0);
    });
  }

  private dropLanding(): void {
    this.landing?.();
    this.landing = null;
  }

  private dropResumeOnCanPlay(): void {
    if (!this.resumeOnCanPlay) return;
    this.v.removeEventListener('canplay', this.resumeOnCanPlay);
    this.resumeOnCanPlay = null;
  }

  private release(): void {
    this.hls?.destroy();
    this.hls = null;
    void this.shaka?.destroy();
    this.shaka = null;
    this.v.removeAttribute('src');
    this.dropLanding();
    this.dropResumeOnCanPlay();
  }

  private resumeWhenPlayable(): void {
    // The <video> outlives this engine, so a resume left armed would start the
    // NEXT item by itself.
    const resume = () => {
      this.resumeOnCanPlay = null;
      this.play();
    };
    this.resumeOnCanPlay = resume;
    this.v.addEventListener('canplay', resume, { once: true });
  }

  private reanchor(absSec: number): void {
    const wasPlaying = !this.v.paused;
    this.baseSec = absSec;
    this.release();
    this.attachMaster();
    if (wasPlaying) this.resumeWhenPlayable();
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
  anchor(): number {
    return this.baseSec;
  }
  duration(): number {
    if (this.durSec > 0) return this.durSec;
    return Number.isFinite(this.v.duration) ? this.v.duration : 0;
  }
  bufferedEnd(): number {
    const end = reachableBufferEnd(this.v.buffered, this.v.currentTime);
    return end > 0 ? this.baseSec + end : 0;
  }

  nudge(): void {
    this.v.currentTime += STALL_NUDGE_SEC;
  }

  recoverStall(): boolean {
    return recoverMse(this.shaka, this.hls);
  }

  restart(absSec: number): void {
    this.reanchor(absSec);
  }

  reload(absSec: number): void {
    const url = this.playlistUrl;
    if (url === null) {
      this.reanchor(absSec);
      return;
    }
    const wasPlaying = !this.v.paused;
    this.release();
    this.attachPlaylist(url, Math.max(0, absSec - this.baseSec));
    if (wasPlaying) this.resumeWhenPlayable();
  }

  seekTo(absSec: number): void {
    if (this.direct) {
      this.v.currentTime = absSec; // direct-play timeline is absolute
      return;
    }
    this.dropLanding();
    const rel = absSec - this.baseSec;
    if (rel >= 0 && isPlayableAt(this.v.buffered, rel)) {
      this.v.currentTime = rel;
      return;
    }
    this.reanchor(absSec);
  }

  setAudioRendition(rendition: number): void {
    if (rendition === this.rendition || this.direct) return;
    this.rendition = rendition;
    // The audio track is muxed in by the URL (no alternate renditions), so a
    // language switch reloads the master at the current position.
    this.reanchor(this.position());
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanupEvents();
    this.release();
    this.v.load();
  }
}
