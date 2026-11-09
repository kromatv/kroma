/** A `<video>` a test drives by hand: it fires the events it is told to and
 * reports what an engine did to it. */
export interface FakeVideo {
  el: HTMLVideoElement;
  fire(type: string): void;
  setBuffered(ranges: [number, number][]): void;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  listenerCount(type: string): number;
  playCalls(): number;
}

/** A paused, empty `<video>`, with `init` laid over its properties. */
export function fakeVideo(init: Record<string, unknown> = {}): FakeVideo {
  const listeners = new Map<string, Set<EventListener>>();
  let ranges: [number, number][] = [];
  let plays = 0;
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
    volume: 1,
    muted: false,
    playbackRate: 1,
    readyState: 0,
    preload: '',
    src: '',
    buffered,
    canPlayType: (_t: string) => '',
    play() {
      plays += 1;
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
    fire: (t) => {
      for (const fn of listeners.get(t) ?? []) fn(new Event(t));
    },
    setBuffered: (r) => {
      ranges = r;
    },
    set: (k, val) => {
      v[k] = val;
    },
    get: (k) => v[k],
    listenerCount: (t) => listeners.get(t)?.size ?? 0,
    playCalls: () => plays,
  };
}
