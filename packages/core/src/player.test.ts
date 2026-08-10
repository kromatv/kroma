import type { KromaClient, MediaItem } from '@kroma/client';
import { describe, expect, it, vi } from 'vitest';
import { attachDirectPlay, formatRuntime } from './player';

const client = { streamUrl: (id: string) => `http://nas/api/items/${id}/stream` } as KromaClient;
const ITEM = { id: 'i1', video: { codec: 'h264', bitDepth: 8 } } as unknown as MediaItem;

function fakeVideo(over: { seekThrows?: boolean; playRejects?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  let currentTime = 0;
  const play = vi.fn(async () => {
    if (over.playRejects) throw new Error('autoplay blocked');
  });
  const el = {
    src: '',
    preload: '',
    get currentTime() {
      return currentTime;
    },
    set currentTime(v: number) {
      if (over.seekThrows) throw new Error('InvalidStateError');
      currentTime = v;
    },
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    play,
  };
  const fire = (type: string) => {
    for (const fn of [...(listeners.get(type) ?? [])]) fn();
  };
  const count = (type: string) => listeners.get(type)?.size ?? 0;
  return { el: el as unknown as HTMLVideoElement, fire, count, play };
}

describe('attachDirectPlay', () => {
  it('points the element at the range-streamed original and reports the verdict', () => {
    const { el } = fakeVideo();
    const verdict = attachDirectPlay(el, client, ITEM);
    expect(el.src).toBe('http://nas/api/items/i1/stream');
    expect(el.preload).toBe('auto');
    expect(verdict.messageKey).toBeTruthy();
  });

  it('seeks once metadata loads, then unsubscribes itself', () => {
    const { el, fire, count } = fakeVideo();
    attachDirectPlay(el, client, ITEM, { startMs: 90_000 });
    expect(count('loadedmetadata')).toBe(1);
    fire('loadedmetadata');
    expect(el.currentTime).toBe(90);
    expect(count('loadedmetadata')).toBe(0);
  });

  it('stops listening even when the element refuses the seek', () => {
    const { el, fire, count } = fakeVideo({ seekThrows: true });
    attachDirectPlay(el, client, ITEM, { startMs: 90_000 });
    expect(() => fire('loadedmetadata')).not.toThrow();
    expect(count('loadedmetadata')).toBe(0);
  });

  it('does not listen for metadata when there is nothing to resume', () => {
    const { el, count } = fakeVideo();
    attachDirectPlay(el, client, ITEM, { startMs: 0 });
    attachDirectPlay(el, client, ITEM);
    expect(count('loadedmetadata')).toBe(0);
  });

  it('starts playback only when asked, and swallows a blocked autoplay', async () => {
    const quiet = fakeVideo();
    attachDirectPlay(quiet.el, client, ITEM);
    expect(quiet.play).not.toHaveBeenCalled();

    const blocked = fakeVideo({ playRejects: true });
    attachDirectPlay(blocked.el, client, ITEM, { autoplay: true });
    expect(blocked.play).toHaveBeenCalledTimes(1);
    await expect(blocked.play.mock.results[0]?.value).rejects.toThrow('autoplay blocked');
  });
});

describe('formatRuntime', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(formatRuntime(7620000)).toBe('2h07'); // 127 min
    expect(formatRuntime(3600000)).toBe('1h00'); // exactly 1h
    expect(formatRuntime(3660000)).toBe('1h01');
  });

  it('formats sub-hour durations as minutes only', () => {
    expect(formatRuntime(2820000)).toBe('47min');
    expect(formatRuntime(60000)).toBe('1min');
  });

  it('rounds to the nearest minute', () => {
    // 89 s rounds to 1 min.
    expect(formatRuntime(89000)).toBe('1min');
    // 29 s rounds to 0 min.
    expect(formatRuntime(29000)).toBe('0min');
  });

  it('returns an empty string for missing / non-positive durations', () => {
    expect(formatRuntime(0)).toBe('');
    expect(formatRuntime(-5000)).toBe('');
    expect(formatRuntime(null)).toBe('');
    expect(formatRuntime(undefined)).toBe('');
  });
});
