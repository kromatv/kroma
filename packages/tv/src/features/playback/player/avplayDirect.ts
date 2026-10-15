import { AT_FILM_START_SEC } from '@kromatv/core';
import { bestEffort } from '#tv/features/playback/player/avplayCalls';
import type { AvplayApi } from '#tv/features/playback/player/engine';

const AUDIO_RETRY_REPORTS = 3;

export class AvplayDirectSource {
  private pendingSeek: number | null = null;
  private pendingAudio: number | null = null;
  private audioRetriesLeft = 0;

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

  /** Hold the rendition's soundtrack and ask for it. The hold stands until a
   * call is seen to land: Tizen refuses a track change at READY
   * (`InvalidStateError`) where the same call takes once PLAYING, and a firmware
   * that accepts it there can still play the container default. */
  wantsAudio(rendition: number): void {
    this.pendingAudio = rendition;
    this.audioRetriesLeft = AUDIO_RETRY_REPORTS;
    this.selectAudio(rendition);
  }

  /** Ask again for the held soundtrack, once per time report, until one call
   * lands or the budget runs out. */
  applyPendingAudio(): void {
    const rendition = this.pendingAudio;
    if (rendition === null) return;
    this.audioRetriesLeft -= 1;
    if (this.selectAudio(rendition) || this.audioRetriesLeft <= 0) this.pendingAudio = null;
  }

  /** The viewer's own pick, which replaces whatever was held. Answers whether
   * the call landed. */
  picksAudio(rendition: number): boolean {
    const landed = this.selectAudio(rendition);
    this.pendingAudio = landed ? null : rendition;
    this.audioRetriesLeft = AUDIO_RETRY_REPORTS;
    return landed;
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
