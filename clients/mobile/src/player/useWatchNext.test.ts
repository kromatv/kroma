// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import type { WatchNext } from '@kromatv/core';
import { DOWNLOAD, TARGET } from '@kromatv/core/test';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const at = vi.hoisted(() => ({ following: [] as WatchNext[] }));

vi.mock('@kromatv/core/react', async (real) => ({
  ...(await real<typeof import('@kromatv/core/react')>()),
  useWatchFollowing: () => at.following,
}));

import { useWatchNext } from '#mobile/player/useWatchNext';

const NEXT: WatchNext = {
  season: 1,
  episode: 2,
  title: 'Les tartes aux myrtilles',
  stillUrl: null,
  runtimeMin: 3,
  subject: { kind: 'download', downloadId: DOWNLOAD, file: 1 },
};

const client = { discovery: {} } as unknown as KromaClient;

function engineAt(cur: number) {
  const ended: (() => void)[] = [];
  return {
    ended,
    engine: {
      player: {
        addListener: (_type: 'playToEnd', fire: () => void) => {
          ended.push(fire);
          return { remove: vi.fn() };
        },
      },
      cur,
      dur: 70,
      shutdown: vi.fn(),
    },
  };
}

beforeEach(() => {
  at.following = [NEXT];
});

describe('the next episode on the phone', () => {
  it('is not offered before the last thirty seconds', () => {
    const { engine } = engineAt(20);

    const { result } = renderHook(() =>
      useWatchNext({ client, target: TARGET, engine, onPlay: vi.fn() }),
    );

    expect(result.current.next).toBe(NEXT);
    expect(result.current.due).toBe(false);
  });

  it('is offered in the last thirty seconds', () => {
    const { engine } = engineAt(45);

    const { result } = renderHook(() =>
      useWatchNext({ client, target: TARGET, engine, onPlay: vi.fn() }),
    );

    expect(result.current.due).toBe(true);
  });

  it('plays once the picture reaches its end, stopping it first', () => {
    const { engine, ended } = engineAt(69);
    const onPlay = vi.fn();
    renderHook(() => useWatchNext({ client, target: TARGET, engine, onPlay }));

    for (const fire of ended) fire();

    expect(engine.shutdown).toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalledWith(NEXT);
  });

  it('offers nothing after the last episode', () => {
    at.following = [];
    const { engine, ended } = engineAt(69);

    const { result } = renderHook(() =>
      useWatchNext({ client, target: TARGET, engine, onPlay: vi.fn() }),
    );

    expect(result.current.next).toBeNull();
    expect(result.current.due).toBe(false);
    expect(ended).toHaveLength(0);
  });
});
