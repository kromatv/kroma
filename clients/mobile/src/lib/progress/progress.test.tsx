// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import type { ItemId, ProgressEntry } from '@kromatv/client/media';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ held: '[]' }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: vi.fn(async () => undefined),
  readAsStringAsync: vi.fn(async () => disk.held),
  writeAsStringAsync: vi.fn(async (_path: string, body: string) => {
    disk.held = body;
  }),
}));

const network = vi.hoisted(() => ({
  listener: null as ((state: { isConnected: boolean }) => void) | null,
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: (fn: (state: { isConnected: boolean }) => void) => {
    network.listener = fn;
    return {
      remove: () => {
        network.listener = null;
      },
    };
  },
}));

import { ProgressQueueProvider, useProgressQueue } from './index';

const ITEM = 'itm-1' as ItemId;
const SERVER = 'https://kroma.test';

function fakeClient(
  save: (itemId: ItemId, positionMs: number) => Promise<unknown>,
  current: () => Promise<ProgressEntry | null> = async () => null,
): KromaClient {
  return {
    baseUrl: SERVER,
    playback: { save, itemProgress: current },
  } as unknown as KromaClient;
}

function mounted(client: KromaClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProgressQueueProvider client={client} userId="usr-1">
      {children}
    </ProgressQueueProvider>
  );
  return renderHook(() => useProgressQueue(), { wrapper });
}

function queued(): unknown[] {
  return JSON.parse(disk.held) as unknown[];
}

beforeEach(() => {
  disk.held = '[]';
  network.listener = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a position the server refused', () => {
  it('is held on disk until something takes it', async () => {
    const { result } = mounted(fakeClient(async () => undefined));

    act(() => result.current.remember(ITEM, 600_000, 3_600_000, false));

    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(queued()[0]).toMatchObject({
      serverUrl: SERVER,
      userId: 'usr-1',
      itemId: ITEM,
      positionMs: 600_000,
      reachedEnd: false,
    });
  });

  it('is dropped once a live save has settled the same title', async () => {
    const { result } = mounted(fakeClient(async () => undefined));
    act(() => result.current.remember(ITEM, 600_000, 3_600_000, false));
    await waitFor(() => expect(queued()).toHaveLength(1));

    act(() => result.current.settle(ITEM));

    await waitFor(() => expect(queued()).toEqual([]));
  });
});

describe('replaying what the device was holding', () => {
  it('sends it at launch and forgets it once the server answers', async () => {
    const saved: number[] = [];
    disk.held = JSON.stringify([
      {
        serverUrl: SERVER,
        userId: 'usr-1',
        itemId: ITEM,
        positionMs: 900_000,
        durationMs: 3_600_000,
        reachedEnd: false,
        capturedAt: Date.now(),
        attempts: 0,
      },
    ]);

    mounted(
      fakeClient(async (_itemId, positionMs) => {
        saved.push(positionMs);
      }),
    );

    await waitFor(() => expect(saved).toEqual([900_000]));
    await waitFor(() => expect(queued()).toEqual([]));
  });

  it('keeps it and tries again when the device says it is back online', async () => {
    const saved: number[] = [];
    let reachable = false;
    disk.held = JSON.stringify([
      {
        serverUrl: SERVER,
        userId: 'usr-1',
        itemId: ITEM,
        positionMs: 900_000,
        durationMs: 3_600_000,
        reachedEnd: false,
        capturedAt: Date.now(),
        attempts: 0,
      },
    ]);

    mounted(
      fakeClient(async (_itemId, positionMs) => {
        if (!reachable) throw new TypeError('network request failed');
        saved.push(positionMs);
      }),
    );
    await waitFor(() => expect(queued()).toHaveLength(1));
    reachable = true;
    act(() => network.listener?.({ isConnected: true }));

    await waitFor(() => expect(saved).toEqual([900_000]));
    await waitFor(() => expect(queued()).toEqual([]));
  });
});

describe('a screen with no provider above it', () => {
  it('holds nothing rather than throwing', () => {
    const { result } = renderHook(() => useProgressQueue());

    expect(() => result.current.remember(ITEM, 1, null, false)).not.toThrow();
    expect(queued()).toEqual([]);
  });
});
