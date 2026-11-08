import type { ClipBackend, ClipEngine } from '#tv/features/playback/player/clipBackend';
import type { EngineListeners } from '#tv/features/playback/player/engine';

export const CLIP_LENGTH_SEC = 120;

export class FakeClip implements ClipEngine {
  readonly url: string;
  readonly listeners: EngineListeners;
  playing = false;
  at = 0;
  rate = 1;
  destroyed = false;

  constructor(url: string, listeners: EngineListeners) {
    this.url = url;
    this.listeners = listeners;
  }

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  isPaused(): boolean {
    return !this.playing;
  }
  position(): number {
    return this.at;
  }
  duration(): number {
    return CLIP_LENGTH_SEC;
  }
  bufferedEnd(): number {
    return 0;
  }
  seekTo(sec: number): void {
    this.at = sec;
  }
  setRate(rate: number): void {
    this.rate = rate;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

export function fakeClipBackend() {
  const built: FakeClip[] = [];
  const backend: ClipBackend<FakeClip> = {
    createClipEngine: ({ url, listeners }) => {
      const engine = new FakeClip(url, listeners);
      built.push(engine);
      return engine;
    },
    Surface: ({ title }) => <div>{`picture of ${title}`}</div>,
  };
  return { backend, built };
}
