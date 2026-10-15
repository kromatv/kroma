// Native Samsung AVPlay backend, in one of two source modes: `direct` opens
// the original file URL and lets the TV demux/decode it natively; `master` is
// the server's HLS remux for files AVPlay can't demux, anchored at `baseSec` so
// a resume/far seek over a network mount starts fast.
//
// AVPlay renders to a video plane behind the page: the player shows a
// transparent `<object type="application/avplayer">` with the HTML chrome
// and subtitle overlay on top.

import {
  AT_FILM_START_SEC,
  AVPLAY_HLS_CAPS,
  decodableAudioCodecs,
  decodableVideoCodecs,
  resolveMasterStart,
} from '@kromatv/core';
import type { AudioFilterMode, PlaneRect } from '@kromatv/ui';
import {
  bestEffort,
  currentSec,
  releasePlayer,
  silenceSubtitles,
} from '#tv/features/playback/player/avplayCalls';
import { AvplayDirectSource } from '#tv/features/playback/player/avplayDirect';
import { AvplayLanding } from '#tv/features/playback/player/avplayLanding';
import {
  AvplayOpens,
  insideRunningMaster,
  seekToAnchor,
} from '#tv/features/playback/player/avplayMaster';
import {
  FULL_PLANE,
  type PlaneBox,
  planeBox,
  samePlaneBox,
} from '#tv/features/playback/player/avplayPlane';
import {
  BaseTvEngine,
  type EngineOptions,
  serverAudioFilter,
} from '#tv/features/playback/player/baseEngine';
import { type AvplayApi, getAvplay } from '#tv/features/playback/player/engine';

export class AvplayEngine extends BaseTvEngine {
  readonly kind = 'avplay';
  private readonly api: AvplayApi;
  private displayRect: PlaneBox = FULL_PLANE;
  private readonly direct: AvplayDirectSource;
  private readonly landing = new AvplayLanding();
  private readonly opens = new AvplayOpens();
  private readonly onVisibility: () => void;

  constructor(opts: EngineOptions) {
    super(opts);
    const api = getAvplay();
    if (!api) throw new Error('AVPlay unavailable');
    this.api = api;
    this.direct = new AvplayDirectSource(api);
    if (this.filter !== 'off' && this.mode === 'direct') {
      // The filter runs server-side, so a filtered start opens the remux (at the
      // same position) instead of the original file.
      this.filterMaster = true;
      this.mode = 'master';
      this.baseSec = this.elSec;
      this.elSec = 0;
    }
    if (this.mode === 'direct') this.direct.wantsStart(opts.startSec);
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
      return this.client.media.hlsMasterUrl(this.item.id, false, this.baseSec, this.rendition, {
        filter: serverAudioFilter(this.filter),
        copyCodecs: this.declaredAudioCodecs(),
        videoCodecs: this.declaredVideoCodecs(),
      });
    }
    return super.sourceUrl();
  }

  protected override declaredAudioCodecs(): string[] {
    return decodableAudioCodecs(AVPLAY_HLS_CAPS);
  }

  protected override declaredVideoCodecs(): string[] {
    return decodableVideoCodecs(AVPLAY_HLS_CAPS);
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
    const stamp = this.opens.begin();
    const url = this.sourceUrl();
    if (this.mode === 'master' && this.baseSec > AT_FILM_START_SEC) {
      void resolveMasterStart(url, this.baseSec).then((real) => {
        if (this.destroyed || this.opens.abandoned(stamp)) return;
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
      bestEffort(() =>
        this.api.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST'),
      );
      // NB: silencing subtitles here (IDLE state) is ignored by Tizen; it's
      // (re)applied in onPrepared (READY) and play (PLAYING) instead.
      this.api.setListener({
        onbufferingstart: () => this.listeners.onWaiting(),
        onbufferingcomplete: () => this.listeners.onPlaying(),
        oncurrentplaytime: (ms: number) => {
          this.elSec = ms / 1000;
          if (this.landing.reported(ms)) this.seekToTop();
          this.direct.applyPendingAudio();
          this.listeners.onTime(this.baseSec + this.elSec);
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

  private onPrepared(): void {
    if (this.destroyed) return;
    silenceSubtitles(this.api);
    if (this.mode === 'direct') {
      // A master's duration is the remux's, which on a playlist still being
      // written is the seconds produced so far, not the runtime.
      const runtime = this.direct.runtime();
      if (runtime > 0) this.durSec = runtime;
      // Resume / fallback hand-off: land on the target before frames roll.
      const target = this.direct.land();
      if (target !== null) this.elSec = target;
      this.direct.wantsAudio(this.rendition);
    } else {
      this.elSec = currentSec(this.api);
      this.landing.attached();
    }
    this.listeners.onDuration(this.durSec);
    this.listeners.onReady(); // the hook drives the FIRST playback start
    if (this.resumeOnLoad) {
      this.resumeOnLoad = false;
      this.play(); // a re-anchor resumes itself (the hook won't, already started)
    }
  }

  private seekToTop(): void {
    this.elSec = 0;
    seekToAnchor(this.api, this.landing);
  }

  private handleVisibility(): void {
    if (this.destroyed) return;
    if (document.visibilityState === 'hidden') {
      bestEffort(() => this.api.suspend());
      return;
    }
    // Direct sources restore at the ABSOLUTE position; anchored masters at the
    // relative one (their clock restarts at the anchor).
    const ms = Math.round((this.mode === 'direct' ? this.position() : this.elSec) * 1000);
    bestEffort(() => this.api.restore(this.sourceUrl(), ms, this.paused ? 'PAUSED' : 'PLAYING'));
  }

  play(): void {
    try {
      this.api.play();
      silenceSubtitles(this.api); // some firmwares only honor it once PLAYING
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
      this.elSec = Math.max(0, absSec);
      this.direct.seekTo(absSec);
      return;
    }
    if (insideRunningMaster(absSec, this.baseSec, this.position())) {
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
      this.direct.wantsStart(absSec);
    } else {
      this.baseSec = absSec;
      this.elSec = 0;
    }
    releasePlayer(this.api);
    this.open();
    // onPrepared fires onReady; the hook restarts playback there.
  }

  /** Shrink/restore the hardware video plane (fraction-rect → 1920x1080 px). */
  setRect(rect: PlaneRect | null): void {
    const next = planeBox(rect);
    if (samePlaneBox(next, this.displayRect)) return;
    this.displayRect = next;
    bestEffort(() => this.api.setDisplayRect(next.x, next.y, next.w, next.h));
  }

  setAudioRendition(rendition: number): void {
    const changed = rendition !== this.rendition;
    this.rendition = rendition;
    // A direct source is asked even when nothing changed: that is how a viewer
    // overrides a set which took the first ask and played the container default
    // anyway. A master carries one audio track, so only a real change is worth
    // anything there, and it reopens the stream at the current position.
    const landed = this.mode === 'direct' && this.direct.picksAudio(rendition);
    if (changed && !landed) this.reanchor(this.position());
  }

  destroy(): void {
    this.destroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    releasePlayer(this.api);
  }
}
