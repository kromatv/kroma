// Native mpv backend for the @kroma/desktop shell (Steam Deck the primary
// target), in one of two source modes (same shape as the Tizen AVPlay
// backend): `direct` opens the original file and lets mpv demux/decode it via
// VA-API, with native absolute seeks and in-place (`aid`) track switches;
// `master` is the server's HLS remux for the rare file mpv can't demux,
// anchored at `baseSec` so a resume/far seek over a network mount starts fast
// (a far seek or language switch re-anchors, since the master carries only
// one audio track).
//
// mpv renders to its own native window behind the transparent Tauri UI
// window, the same "plane behind the page" model AVPlay uses on Tizen, so
// this backend shows no in-page media element (surface: 'mpv').

import type { AudioFilterMode, PlaneRect } from '@kroma/ui';
import {
  BaseTvEngine,
  type EngineOptions,
  NATIVE_SEEK_AHEAD,
} from '#tv/features/playback/player/baseEngine';
import {
  getTauri,
  resolveMasterStart,
  type TauriBridge,
} from '#tv/features/playback/player/engine';

/** A single mpv IPC command: `{"command": args}` (fire-and-forget). */
type MpvArg = string | number | boolean;

// `af` chains tuned to match the Web Audio compressor in @kroma/ui
// `audio-filter.ts`, so every engine sounds the same. `lavfi=[...]` is
// explicit so the bracket body is plain ffmpeg filter syntax on every mpv build.
const MPV_AF: Record<Exclude<AudioFilterMode, 'off'>, string> = {
  standard: 'lavfi=[acompressor=threshold=0.063:ratio=4:attack=10:release=250:knee=6:makeup=1.4]',
  night: 'lavfi=[acompressor=threshold=0.04:ratio=8:attack=4:release=250:knee=5,volume=0.9]',
  // Gain, not compression: the track is quiet rather than uneven.
  boost: 'lavfi=[volume=1.75]',
};

export class MpvEngine extends BaseTvEngine {
  readonly kind = 'mpv';
  private readonly bridge: TauriBridge;
  private cacheSec = 0;
  // mpv's own track ids for the audio streams, in file order; the array index
  // is the audio-relative rendition. Ids aren't always a simple 1,2,3… since
  // embedded fonts/attachments/cover art take ids too.
  private audioIds: number[] = [];
  private pendingSeek: number | null = null;
  private readonly unlisten: Array<() => void> = [];

  constructor(opts: EngineOptions) {
    super(opts);
    const bridge = getTauri();
    if (!bridge) throw new Error('mpv bridge unavailable');
    this.bridge = bridge;
    if (this.mode === 'direct') {
      this.pendingSeek = opts.startSec > 0.5 ? opts.startSec : null;
    }
  }

  // Kept out of the constructor so it holds no async work; called once right after.
  start(): void {
    void this.subscribe();
    this.open();
  }

  private cmd(...args: MpvArg[]): void {
    void this.bridge.core.invoke('mpv_command', { args }).catch(() => undefined);
  }

  private setProp(name: string, value: MpvArg): void {
    this.cmd('set_property', name, value);
  }

  // `start` lets mpv seek during the open (resume) instead of buffering at 0 first.
  private load(url: string, start = 0): void {
    void this.bridge.core.invoke('mpv_load', { url, start }).catch(() => this.fail());
  }

  private async subscribe(): Promise<void> {
    const on = async (event: string, cb: (payload: unknown) => void) => {
      const un = await this.bridge.event.listen(event, (e) => {
        if (!this.destroyed) cb(e.payload);
      });
      if (this.destroyed) un();
      else this.unlisten.push(un);
    };
    await Promise.all([
      on('mpv://property', (p) => this.onProperty(p as { name: string; data: unknown })),
      on('mpv://file-loaded', () => this.onLoaded()),
      on('mpv://end-file', (p) => this.onEndFile(p as { reason?: string })),
      // The mpv process itself is gone (crashed, killed, never became reachable):
      // no direct→master fallback can help, surface the error immediately.
      on('mpv://error', () => this.fatal()),
      on('mpv://exited', () => this.fatal()),
    ]);
    // mpv may have died (or never launched) before this engine subscribed, in
    // which case no event ever arrives. Probe once so a dead process fails
    // fast instead of leaving an endless spinner.
    const status = await this.bridge.core.invoke('mpv_status').catch(() => null);
    if (status === 'dead') this.fatal();
  }

  // Fails without the direct->master retry: the mpv process itself is unusable.
  private fatal(): void {
    if (this.destroyed) return;
    this.fellBack = true;
    this.listeners.onError();
  }

  private onProperty(p: { name: string; data: unknown }): void {
    switch (p.name) {
      case 'time-pos': {
        if (typeof p.data === 'number') {
          this.elSec = p.data;
          this.listeners.onTime(this.position());
        }
        break;
      }
      case 'duration': {
        this.onDurationProp(p.data);
        break;
      }
      case 'demuxer-cache-time': {
        if (typeof p.data === 'number') {
          this.cacheSec = p.data;
          this.listeners.onBuffered(this.baseSec + p.data);
        }
        break;
      }
      case 'pause': {
        this.paused = p.data === true;
        if (this.paused) this.listeners.onPause();
        else this.listeners.onPlay();
        break;
      }
      case 'paused-for-cache': {
        if (p.data === true) this.listeners.onWaiting();
        else this.listeners.onPlaying();
        break;
      }
      case 'track-list': {
        this.onTrackList(p.data);
        break;
      }
    }
  }

  /** Direct mode: mpv's duration is the real absolute runtime; prefer it over the
   * catalogue value. Master mode: the remux restarts at 0, so mpv's duration is the
   * REMAINING tail from the anchor - keep the catalogue total. */
  private onDurationProp(data: unknown): void {
    if (typeof data === 'number' && data > 0 && this.mode === 'direct') {
      this.durSec = data;
      this.listeners.onDuration(this.durSec);
    }
  }

  /** The observed `track-list`: remember mpv's own audio track ids (in file order)
   * so a rendition maps to the right track, then re-assert the wanted one. */
  private onTrackList(data: unknown): void {
    if (!Array.isArray(data)) return;
    const audio = (data as Array<{ id?: number; type?: string }>).filter(
      (t) => t?.type === 'audio' && typeof t.id === 'number',
    );
    this.audioIds = audio.map((t) => t.id as number);
    // Re-assert the wanted track now that the real ids are known (idempotent).
    if (this.audioIds.length) this.selectAudio(this.rendition);
  }

  private onLoaded(): void {
    if (this.mode === 'direct') {
      const target = this.pendingSeek;
      this.pendingSeek = null;
      if (target != null) {
        this.elSec = target;
        this.cmd('seek', target, 'absolute');
      }
      this.selectAudio(this.rendition);
    } else {
      this.elSec = 0;
    }
    // Unconditional: the mpv process outlives engines, so a leftover `af`
    // from the previous item must be cleared, not inherited.
    this.applyFilter();
    this.listeners.onDuration(this.durSec);
    this.listeners.onReady();
    if (this.resumeOnLoad) {
      this.resumeOnLoad = false;
      this.play();
    }
  }

  private onEndFile(p: { reason?: string }): void {
    if (p.reason === 'eof') {
      this.listeners.onEnded();
      return;
    }
    if (p.reason === 'error') this.fail();
  }

  // An anchored master first resolves its real start (the keyframe the
  // server actually seeked to) so `baseSec` stays honest; direct sources
  // open at once, at the current position, so mpv seeks during load.
  private open(): void {
    const url = this.sourceUrl();
    if (this.mode === 'master' && this.baseSec > 0.5) {
      void resolveMasterStart(url, this.baseSec).then((real) => {
        if (this.destroyed) return;
        this.baseSec = real;
        this.load(url);
      });
      return;
    }
    this.load(url, this.mode === 'direct' ? this.elSec : 0);
  }

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
    this.open();
  }

  // Maps the audio-relative rendition to mpv's own track id via the observed
  // track-list, falling back to R+1 (mpv's usual numbering) until it arrives.
  private selectAudio(rendition: number): void {
    const id = this.audioIds[rendition];
    this.setProp('aid', id ?? rendition + 1);
  }

  play(): void {
    this.setProp('pause', false);
    this.paused = false;
    this.listeners.onPlay();
  }
  pause(): void {
    this.setProp('pause', true);
    this.paused = true;
    this.listeners.onPause();
  }
  bufferedEnd(): number {
    return this.baseSec + Math.max(this.elSec, this.cacheSec);
  }

  seekTo(absSec: number): void {
    if (this.mode === 'direct') {
      // The original file is one fully-seekable VOD: every seek is native+absolute.
      this.elSec = Math.max(0, absSec);
      this.cmd('seek', Math.max(0, absSec), 'absolute');
      return;
    }
    const here = this.position();
    if (absSec >= this.baseSec && absSec <= here + NATIVE_SEEK_AHEAD) {
      this.elSec = absSec - this.baseSec;
      this.cmd('seek', Math.max(0, absSec - this.baseSec), 'absolute');
      return;
    }
    this.reanchor(absSec);
  }

  setAudioRendition(rendition: number): void {
    if (rendition === this.rendition) return;
    this.rendition = rendition;
    // Direct: in-place native track switch. Master: the stream carries only
    // one audio track, so reopen it at the current position.
    if (this.mode === 'direct') {
      this.selectAudio(rendition);
      return;
    }
    this.reanchor(this.position());
  }

  // mpv rebuilds its `af` graph live, so playback never stops.
  setAudioFilter(mode: AudioFilterMode): void {
    if (mode === this.filter) return;
    this.filter = mode;
    this.applyFilter();
  }

  private applyFilter(): void {
    this.setProp('af', this.filter === 'off' ? '' : MPV_AF[this.filter]);
  }

  // The mpv window fills the screen behind the page, so a fraction-rect maps
  // straight to margin ratios; the video letterboxes inside the remainder.
  setRect(rect: PlaneRect | null): void {
    const [l, t, r, b] = rect
      ? [rect.x, rect.y, Math.max(0, 1 - (rect.x + rect.w)), Math.max(0, 1 - (rect.y + rect.h))]
      : [0, 0, 0, 0];
    this.setProp('video-margin-ratio-left', l);
    this.setProp('video-margin-ratio-top', t);
    this.setProp('video-margin-ratio-right', r);
    this.setProp('video-margin-ratio-bottom', b);
  }

  destroy(): void {
    this.destroyed = true;
    for (const un of this.unlisten) un();
    this.unlisten.length = 0;
    // Keep the mpv process alive for the next item; just stop the current file so
    // it idles behind the UI (the shell kills the process on app exit).
    this.cmd('stop');
  }
}
