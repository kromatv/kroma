// The durable half of watch progress: a position the server refused is held on
// disk per account, server and title, and replayed when the link comes back or
// at the next launch. Live playback sessions stay in `player/heartbeat`.

import type { KromaClient } from '@kromatv/client';
import type { ItemId } from '@kromatv/client/media';
import {
  createProgressQueue,
  type ProgressAccount,
  type ProgressTarget,
  replayBackoffMs,
} from '@kromatv/core';
import * as Network from 'expo-network';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { pendingProgressStore } from './store';

const queue = createProgressQueue(pendingProgressStore());

/** `remember` holds the latest position for a title, replacing anything held
 *  for it; `settle` drops it for a position the server has just taken. Both are
 *  fire-and-forget: a player must not wait on the disk to keep playing. */
export interface ProgressQueueApi {
  remember(
    itemId: ItemId,
    positionMs: number,
    durationMs: number | null,
    reachedEnd: boolean,
  ): void;
  settle(itemId: ItemId): void;
}

const NOWHERE: ProgressQueueApi = { remember: () => undefined, settle: () => undefined };

const Ctx = createContext<ProgressQueueApi>(NOWHERE);

/** Outside the provider this holds nothing, so a screen rendered without one
 *  saves exactly as it did before. */
export function useProgressQueue(): ProgressQueueApi {
  return useContext(Ctx);
}

function targetFor(client: KromaClient): ProgressTarget {
  return {
    current: (itemId) => client.playback.itemProgress(itemId),
    save: (itemId, positionMs, durationMs) => client.playback.save(itemId, positionMs, durationMs),
  };
}

export function ProgressQueueProvider({
  client,
  userId,
  children,
}: Readonly<{
  client: KromaClient | null;
  userId: string | null;
  children: ReactNode;
}>) {
  const account: ProgressAccount | null =
    client && userId ? { serverUrl: client.baseUrl, userId } : null;
  const serverUrl = account?.serverUrl ?? null;

  const api = useMemo<ProgressQueueApi>(
    () => ({
      remember: (itemId, positionMs, durationMs, reachedEnd) => {
        if (!serverUrl || !userId) return;
        void queue.remember({
          serverUrl,
          userId,
          itemId,
          positionMs: Math.max(0, Math.round(positionMs)),
          durationMs: durationMs && durationMs > 0 ? Math.round(durationMs) : null,
          reachedEnd,
          capturedAt: Date.now(),
        });
      },
      settle: (itemId) => {
        if (!serverUrl || !userId) return;
        void queue.settle({ serverUrl, userId, itemId });
      },
    }),
    [serverUrl, userId],
  );

  useReplay(client, serverUrl, userId);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function useReplay(client: KromaClient | null, serverUrl: string | null, userId: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef<() => void>(() => undefined);

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!client || !serverUrl || !userId) return;
    let live = true;
    let failures = 0;
    const account = { serverUrl, userId };
    const target = targetFor(client);
    const pass = async () => {
      stopTimer();
      const report = await queue.replay(account, target).catch(() => null);
      if (!live) return;
      failures = report && report.kept > 0 ? failures + 1 : 0;
      if (failures > 0) timer.current = setTimeout(() => void pass(), replayBackoffMs(failures));
    };
    run.current = () => void pass();
    void pass();
    const listener = Network.addNetworkStateListener((state) => {
      if (!state.isConnected) return;
      failures = 0;
      run.current();
    });
    return () => {
      live = false;
      stopTimer();
      listener.remove();
    };
  }, [client, serverUrl, userId, stopTimer]);
}
