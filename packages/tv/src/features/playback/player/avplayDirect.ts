import { AT_FILM_START_SEC } from '@kromatv/core';
import { bestEffort } from '#tv/features/playback/player/avplayCalls';
import type { AvplayApi } from '#tv/features/playback/player/engine';

export class AvplayDirectSource {
  private pendingSeek: number | null = null;
  private pendingAudio: number | null = null;

  constructor(private readonly api: AvplayApi) {}

  /** Hold the second to land on once the source is READY. */
  wantsStart(absSec: number): void {
    this.pendingSeek = absSec > AT_FILM_START_SEC ? absSec : null;
  }

  /** Seek to the held second, and answer it, or null when there was none. */
  land(): number | null {
    const target = this.pendingSeek;
    this.pendingSeek = null;
    if (target === null) return null;
    bestEffort(() => this.api.seekTo(Math.max(0, Math.round(target * 1000))));
    return target;
  }

  seekTo(absSec: number): void {
    bestEffort(() => this.api.seekTo(Math.max(0, Math.round(absSec * 1000))));
  }

  /** The file's own runtime in seconds, 0 where the firmware will not say. */
  runtime(): number {
    let seconds = 0;
    bestEffort(() => {
      const ms = this.api.getDuration();
      if (ms > 0) seconds = ms / 1000;
    });
    return seconds;
  }

  /** Select the rendition's soundtrack, holding a refusal: the container default
   * may not be the wanted language, and Tizen refuses a track change at READY
   * (`InvalidStateError`), where the same call lands once PLAYING. */
  wantsAudio(rendition: number): void {
    if (!this.selectAudio(rendition)) this.pendingAudio = rendition;
  }

  applyPendingAudio(): void {
    const rendition = this.pendingAudio;
    if (rendition === null) return;
    this.pendingAudio = null;
    this.selectAudio(rendition);
  }

  /** Map an audio-relative index onto AVPlay's internal track index and select it;
   * false where the track list cannot be read or has no such track. */
  selectAudio(rendition: number): boolean {
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
}
