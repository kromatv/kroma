import { vi } from 'vitest';
import type { EngineListeners } from '#tv/features/playback/player/engine';

export interface FakeVideo {
  el: HTMLVideoElement;
  fire(type: string): void;
  setBuffered(ranges: [number, number][]): void;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  listenerCount(type: string): number;
}

export function fakeVideo(init: Record<string, unknown> = {}): FakeVideo {
  const listeners = new Map<string, Set<EventListener>>();
  let ranges: [number, number][] = [];
  const buffered = {
    get length() {
      return ranges.length;
    },
    start: (i: number) => ranges[i]?.[0] ?? 0,
    end: (i: number) => ranges[i]?.[1] ?? 0,
  };
  const v: Record<string, unknown> = {
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    preload: '',
    src: '',
    buffered,
    canPlayType: (_t: string) => '',
    play() {
      v.paused = false;
      return Promise.resolve();
    },
    pause() {
      v.paused = true;
    },
    load() {},
    removeAttribute(_n: string) {
      v.src = '';
    },
    addEventListener(t: string, fn: EventListener) {
      let s = listeners.get(t);
      if (!s) {
        s = new Set();
        listeners.set(t, s);
      }
      s.add(fn);
    },
    removeEventListener(t: string, fn: EventListener) {
      listeners.get(t)?.delete(fn);
    },
    ...init,
  };
  return {
    el: v as unknown as HTMLVideoElement,
    fire: (t: string) => {
      for (const fn of [...(listeners.get(t) ?? [])]) fn(new Event(t));
    },
    setBuffered: (r) => {
      ranges = r;
    },
    set: (k, val) => {
      v[k] = val;
    },
    get: (k) => v[k],
    listenerCount: (t) => listeners.get(t)?.size ?? 0,
  };
}

export function fakeListeners(): EngineListeners {
  return {
    onTime: vi.fn(),
    onDuration: vi.fn(),
    onBuffered: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onWaiting: vi.fn(),
    onPlaying: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onReady: vi.fn(),
    onAspect: vi.fn(),
    onSurfaceChange: vi.fn(),
  };
}
