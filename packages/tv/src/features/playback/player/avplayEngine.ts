// Native Samsung AVPlay backend, in one of two source modes: `direct` opens
// the original file URL and lets the TV demux/decode it natively (seeks and
// audio-track switches are native, in place); `master` is the server's HLS
// remux for files AVPlay can't demux, anchored at `baseSec` so a resume/far
// seek over a network mount starts fast (absolute position is
// `baseSec + avplay time`; a far seek or language switch re-anchors).
//
// AVPlay renders to a video plane behind the page: the player shows a
// transparent `<object type="application/avplayer">` with the HTML chrome
// and subtitle overlay on top.

import { decodableAudioCodecs } from '@kroma/core';
import type { AudioFilterMode, PlaneRect } from '@kroma/ui';
import {
  BaseTvEngine,
  type EngineOptions,
  NATIVE_SEEK_AHEAD,
  serverAudioFilter,
} from '#tv/features/playback/player/baseEngine';
import { type AvplayApi, getAvplay, resolveMasterStart } from '#tv/features/playback/player/engine';

// AVPlay's display coordinate space is the app's fixed 1920x1080 canvas.
const AVPLAY_W = 1920;
const AVPLAY_H = 1080;

export class AvplayEngine extends BaseTvEngine {
  readonly kind = 'avplay';
  private readonly api: AvplayApi;
  private pendingSeek: number | null = null;
  private displayRect = { x: 0, y: 0, w: AVPLAY_W, h: AVPLAY_H };
  private openGen = 0;
  private readonly onVisibility: () => void;

  constructor(opts: EngineOptions) {
    super(opts);
    const api = getAvplay();
    if (!api) throw new Error('AVPlay unavailable');
    this.api = api;
    if (this.filter !== 'off' && this.mode === 'direct') {
      // The filter runs server-side, so a filtered start opens the remux (at the
      // same position) instead of the original file.
      this.filterMaster = true;
      this.mode = 'master';
      this.baseSec = this.elSec;
      this.elSec = 0;
    }
    if (this.mode === 'direct') {
      this.pendingSeek = opts.startSec > 0.5 ? opts.startSec : null;
    }
    this.onVisibility = () => this.handleVisibility();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    this.open();
  }

  /** A filtered master carries the loudness filter in its mode segment: AVPlay
   * has no client-side audio DSP, so the server's remux applies it instead. */
  protected sourceUrl(): string {
    if (this.mode === 'master' && this.filter !== 'off') {
      return this.client.hlsMasterUrl(this.item.id, false, this.baseSec, this.rendition, {
        filter: serverAudioFilter(this.filter),
        copyCodecs: decodableAudioCodecs(),
      });
    }
    return super.sourceUrl();
  }

  /** Reloads the source at the current position with the new filter mode; a
   * filtered direct source moves onto the remux, and vice versa when turned off. */
  setAudioFilter(mode: AudioFilterMode): void {
    if (mode === this.filter) return;
    this.filter = mode;
    if (this.mode === 'direct') {
      this.filterMaster = true;
      this.mode = 'master';
    } else if (mode === 'off' && this.filterMaster && !this.fellBack) {
      this.filterMaster = false;
      this.mode = 'direct';
    }
    this.listeners.onWaiting();
    this.reanchor(this.position());
  }

  // An anchored master first resolves its real start (the keyframe the server
  // actually seeked to) so `baseSec` stays honest; direct sources open at once.
  private open(): void {
    // A filter toggle or seek can arrive while this round-trip is pending, so
    // stamp a generation and drop a stale resolution rather than overwrite
    // `baseSec` with an abandoned source's answer.
    const gen = ++this.openGen;
    const url = this.sourceUrl();
    if (this.mode === 'master' && this.baseSec > 0.5) {
      void resolveMasterStart(url, this.baseSec).then((real) => {
        if (this.destroyed || gen !== this.openGen) return;
        this.baseSec = real;
        this.openNow(url);
      });
      return;
    }
    this.openNow(url);
  }

  private openNow(url: string): void {
    try {
      this.api.open(url);
      const r = this.displayRect;
      this.api.setDisplayRect(r.x, r.y, r.w, r.h);
      try {
        this.api.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST');
      } catch {
        /* not all firmwares accept this */
      }
      // NB: silencing subtitles here (IDLE state) is ignored by Tizen; it's
      // (re)applied in onPrepared (READY) and play (PLAYING) instead.
      this.api.setListener({
        onbufferingstart: () => this.listeners.onWaiting(),
        onbufferingcomplete: () => this.listeners.onPlaying(),
        oncurrentplaytime: (ms: number) => {
          this.elSec = ms / 1000;
          this.listeners.onTime(this.baseSec + this.elSec);
          this.listeners.onBuffered(this.baseSec + this.elSec);
        },
        onstreamcompleted: () => this.listeners.onEnded(),
        onerror: () => this.fail(),
      });
      this.api.prepareAsync(
        () => this.onPrepared(),
        () => this.fail(),
      );
    } catch {
      this.fail();
    }
  }

  // Suppresses AVPlay's own subtitle rendering (we draw our own). Firmware
  // honors it inconsistently by state, so it's re-asserted at READY and PLAYING.
  private silenceSubtitles(): void {
    try {
      this.api.setSilentSubtitle(true);
    } catch {
      /* not all firmwares expose it */
    }
  }

  private onPrepared(): void {
    if (this.destroyed) return;
    this.silenceSubtitles();
    try {
      const d = this.api.getDuration();
      if (d > 0) this.durSec = d / 1000;
    } catch {
      /* keep the catalogue runtime */
    }
    if (this.mode === 'direct') {
      // Resume / fallback hand-off: land on the target before frames roll.
      const target = this.pendingSeek;
      this.pendingSeek = null;
      if (target != null) {
        this.elSec = target;
        try {
          this.api.seekTo(Math.max(0, Math.round(target * 1000)));
        } catch {
          /* keep from 0 */
        }
      }
      // The container default may not be the wanted language; select explicitly.
      this.selectNativeAudio(this.rendition);
    } else {
      this.elSec = 0;
    }
    this.listeners.onDuration(this.durSec);
    this.listeners.onReady(); // the hook drives the FIRST playback start
    if (this.resumeOnLoad) {
      this.resumeOnLoad = false;
      this.play(); // a re-anchor resumes itself (the hook won't, already started)
    }
  }

  private handleVisibility(): void {
    if (this.destroyed) return;
    try {
      if (document.visibilityState === 'hidden') this.api.suspend();
      else {
        // Direct sources restore at the ABSOLUTE position; anchored masters at
        // the relative one (their clock restarts at the anchor).
        const ms = Math.round((this.mode === 'direct' ? this.position() : this.elSec) * 1000);
        this.api.restore(this.sourceUrl(), ms, 'PLAYING');
      }
    } catch {
      /* best effort */
    }
  }

  play(): void {
    try {
      this.api.play();
      this.silenceSubtitles(); // some firmwares only honor it once PLAYING
      this.paused = false;
      this.listeners.onPlay();
    } catch {
      /* ignore */
    }
  }
  pause(): void {
    try {
      this.api.pause();
      this.paused = true;
      this.listeners.onPause();
    } catch {
      /* ignore */
    }
  }
  // AVPlay reports no buffered range, and handing back the position would draw
  // a zero-length buffer as though it had been measured.
  bufferedEnd(): null {
    return null;
  }

  debugRows(): { label: string; value: string }[] {
    const { x, y, w, h } = this.displayRect;
    return [
      { label: 'Plane', value: 'AVPlay' },
      { label: 'Display rect', value: `${x},${y} ${w}×${h}` },
    ];
  }

  seekTo(absSec: number): void {
    if (this.mode === 'direct') {
      // The original file is one fully-seekable VOD: every seek is native.
      this.elSec = Math.max(0, absSec);
      try {
        this.api.seekTo(Math.max(0, Math.round(absSec * 1000)));
      } catch {
        /* transient (e.g. mid-prepare); the position state stays consistent */
      }
      return;
    }
    const here = this.position();
    // Native within the current remux + its buffer; otherwise re-anchor.
    if (absSec >= this.baseSec && absSec <= here + NATIVE_SEEK_AHEAD) {
      this.elSec = absSec - this.baseSec;
      try {
        this.api.seekTo(Math.max(0, Math.round((absSec - this.baseSec) * 1000)));
      } catch {
        this.reanchor(absSec);
      }
      return;
    }
    this.reanchor(absSec);
  }

  /** Reopen the current mode's source at `absSec` (master: a new anchor; direct:
   * a post-prepare seek used by the direct→master fallback hand-off too). */
  protected reanchor(absSec: number): void {
    this.resumeOnLoad = !this.paused;
    if (this.mode === 'direct') {
      this.baseSec = 0;
      this.elSec = absSec;
      this.pendingSeek = absSec > 0.5 ? absSec : null;
    } else {
      this.baseSec = absSec;
      this.elSec = 0;
    }
    try {
      this.api.stop();
    } catch {
      /* ignore */
    }
    try {
      this.api.close();
    } catch {
      /* ignore */
    }
    this.open();
    // onPrepared fires onReady; the hook restarts playback there.
  }

  // Maps an audio-relative index to AVPlay's internal track index.
  private selectNativeAudio(rendition: number): boolean {
    try {
      const audios = this.api.getTotalTrackInfo().filter((t) => t.type === 'AUDIO');
      const track = audios[rendition];
      if (!track) return false;
      this.api.setSelectTrack('AUDIO', track.index);
      return true;
    } catch {
      return false;
    }
  }

  /** Shrink/restore the hardware video plane (fraction-rect → 1920x1080 px). */
  setRect(rect: PlaneRect | null): void {
    const next = rect
      ? {
          x: Math.round(rect.x * AVPLAY_W),
          y: Math.round(rect.y * AVPLAY_H),
          w: Math.round(rect.w * AVPLAY_W),
          h: Math.round(rect.h * AVPLAY_H),
        }
      : { x: 0, y: 0, w: AVPLAY_W, h: AVPLAY_H };
    const p = this.displayRect;
    // Skip a no-op resize (e.g. the restore-to-fullscreen on unmount when already
    // fullscreen) - each setDisplayRect hits the hardware compositor.
    if (next.x === p.x && next.y === p.y && next.w === p.w && next.h === p.h) return;
    this.displayRect = next;
    try {
      this.api.setDisplayRect(next.x, next.y, next.w, next.h);
    } catch {
      /* transient (mid-prepare); re-applied on the next open() */
    }
  }

  setAudioRendition(rendition: number): void {
    if (rendition === this.rendition) return;
    this.rendition = rendition;
    // Direct: in-place native track switch. Master: the stream carries only
    // one audio track, so a language switch reopens it at the current position.
    if (this.mode === 'direct' && this.selectNativeAudio(rendition)) return;
    this.reanchor(this.position());
  }

  destroy(): void {
    this.destroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    // Singleton hardware resource: stop THEN close, or the next open() fails.
    try {
      this.api.stop();
    } catch {
      /* ignore */
    }
    try {
      this.api.close();
    } catch {
      /* ignore */
    }
  }
}
