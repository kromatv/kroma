import { reachableBufferEnd } from '@kromatv/core';
import type { ClipEngine } from '#tv/features/playback/player/clipBackend';
import type { EngineListeners } from '#tv/features/playback/player/engine';
import { bindMediaEvents } from '#tv/features/playback/player/htmlEvents';

/** A clip on the page's own `<video>`, which plays the file as it is. Destroying
 * it lets go of the file, so the element stops downloading it. */
export class HtmlClipEngine implements ClipEngine {
  private readonly video: HTMLVideoElement;
  private readonly unbind: () => void;

  constructor(video: HTMLVideoElement, url: string, listeners: EngineListeners) {
    this.video = video;
    this.unbind = bindMediaEvents(video, listeners, 0, () => 0);
    video.preload = 'auto';
    video.src = url;
  }

  play(): void {
    const started = this.video.play() as Promise<void> | undefined;
    started?.catch(() => undefined);
  }
  pause(): void {
    this.video.pause();
  }
  isPaused(): boolean {
    return this.video.paused;
  }
  position(): number {
    return this.video.currentTime;
  }
  duration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }
  bufferedEnd(): number {
    return reachableBufferEnd(this.video.buffered, this.video.currentTime);
  }
  seekTo(sec: number): void {
    this.video.currentTime = sec;
  }
  setRate(rate: number): void {
    this.video.playbackRate = rate;
  }
  destroy(): void {
    this.unbind();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
