import type { KromaClient, MediaItem } from '@kroma/core';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useEntries } from './entries';
import { reconcileTransfers } from './reconcile';
import { type DownloadEntry, writeWanted } from './store';
import {
  CANCELLED,
  runTransfer,
  type TransferHandle,
  type TransferHooks,
  TransferInterrupted,
} from './transfer';

// One transfer at a time: a season enqueued in bulk must not spawn a remux
// ffmpeg per episode on the server.
const MAX_CONCURRENT = 1;

export interface TransferQueue {
  entries: DownloadEntry[];
  active: Record<string, number>;
  pausedIds: string[];
  queuedIds: string[];
  activeItems: Map<string, MediaItem>;
  canDownload(item: MediaItem): boolean;
  start(item: MediaItem): void;
  pause(itemId: string): void;
  resume(itemId: string): void;
  cancel(itemId: string): void;
  remove(itemId: string): Promise<void>;
}

export function useTransferQueue(client: KromaClient | null): TransferQueue {
  const t = useT();
  const { entries, hasEntry, upsertEntry, remove } = useEntries();
  const [active, setActive] = useState<Record<string, number>>({});
  const [pausedIds, setPausedIds] = useState<string[]>([]);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const activeItemsRef = useRef<Map<string, MediaItem>>(new Map());
  const handlesRef = useRef<Map<string, TransferHandle>>(new Map());
  const pausedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const syncQueue = useCallback((next: string[]) => {
    queueRef.current = next;
    setQueuedIds(next);
  }, []);

  const markPaused = useCallback((id: string, on: boolean) => {
    const next = new Set(pausedRef.current);
    if (on) next.add(id);
    else next.delete(id);
    pausedRef.current = next;
    setPausedIds([...next]);
  }, []);

  const persistWanted = useCallback(() => {
    const ids = [...runningRef.current, ...queueRef.current];
    void writeWanted(
      ids.flatMap((id) => {
        const item = activeItemsRef.current.get(id);
        return item ? [item] : [];
      }),
    );
  }, []);

  const trackProgress = useCallback((itemId: string, frac: number) => {
    setActive((a) => ({ ...a, [itemId]: frac }));
  }, []);

  // Remux makes every title downloadable; this only excludes items with no file.
  const canDownload = useCallback(
    (item: MediaItem) => item.files.length > 0 || !!item.container,
    [],
  );

  const scheduleRetry = useCallback((attempt: number) => {
    const delay = Math.min(5000 * 2 ** Math.max(0, attempt - 1), 60_000);
    const timer = setTimeout(() => {
      retryTimersRef.current.delete(timer);
      pumpRef.current?.();
    }, delay);
    retryTimersRef.current.add(timer);
  }, []);
  useEffect(
    () => () => {
      for (const timer of retryTimersRef.current) clearTimeout(timer);
    },
    [],
  );
  useEffect(() => {
    const sub = Network.addNetworkStateListener((state) => {
      if (state.isConnected) pumpRef.current?.();
    });
    return () => sub.remove();
  }, []);

  const execute = useCallback(
    (
      item: MediaItem,
      run: (hooks: TransferHooks) => Promise<DownloadEntry>,
      startingProgress: number,
    ) => {
      if (runningRef.current.has(item.id)) return;
      runningRef.current.add(item.id);
      activeItemsRef.current.set(item.id, item);
      persistWanted();
      trackProgress(item.id, startingProgress);
      void (async () => {
        let requeue = false;
        try {
          const entry = await run({
            onTask: (handle) => {
              handlesRef.current.set(item.id, handle);
              // Honour a cancel that landed before there was a handle to act on.
              return !cancelledRef.current.delete(item.id);
            },
            onProgress: (frac) => {
              // Bytes are flowing again: the network is fine, forget the streak.
              if (frac > 0) attemptsRef.current.delete(item.id);
              trackProgress(item.id, frac);
            },
          });
          upsertEntry(item.id, entry);
          attemptsRef.current.delete(item.id);
        } catch (err) {
          const cancelled = err instanceof Error && err.message === CANCELLED;
          if (!cancelled && err instanceof TransferInterrupted) {
            // Network died, not the download: requeue, retry on backoff. No
            // alert - there's nothing the user can do about a tunnel.
            requeue = true;
            attemptsRef.current.set(item.id, (attemptsRef.current.get(item.id) ?? 0) + 1);
            console.log(`[downloads] interrupted ${item.id}: ${err.message}`);
          } else if (!cancelled) {
            // Cancels are user-initiated; real failures must be VISIBLE (e.g. a
            // server without the /download endpoint, or a truncated transfer).
            console.log(
              `[downloads] FAILED ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
            Alert.alert(item.metadata?.title ?? item.title, t('offline.failed'));
          }
        } finally {
          runningRef.current.delete(item.id);
          cancelledRef.current.delete(item.id);
          handlesRef.current.delete(item.id);
          markPaused(item.id, false);
          if (requeue) {
            syncQueue([item.id, ...queueRef.current.filter((id) => id !== item.id)]);
          } else {
            activeItemsRef.current.delete(item.id);
            attemptsRef.current.delete(item.id);
          }
          persistWanted();
          setActive((a) => {
            const { [item.id]: _dropped, ...rest } = a;
            return rest;
          });
          if (requeue) scheduleRetry(attemptsRef.current.get(item.id) ?? 1);
          else pumpRef.current?.();
        }
      })();
    },
    [markPaused, persistWanted, scheduleRetry, syncQueue, trackProgress, upsertEntry, t],
  );

  const runDownload = useCallback(
    (item: MediaItem) => {
      if (!client) return;
      execute(item, (hooks) => runTransfer(client, item, hooks), 0);
    },
    [client, execute],
  );

  // pump() lives behind a ref so runDownload's finally can call the latest one;
  // set in an effect since a ref written during render can go stale.
  const pumpRef = useRef<(() => void) | null>(null);
  const pump = useCallback(() => {
    if (!client) return;
    while (runningRef.current.size < MAX_CONCURRENT && queueRef.current.length > 0) {
      const [id, ...rest] = queueRef.current;
      if (!id) break;
      syncQueue(rest);
      const item = activeItemsRef.current.get(id);
      if (item) runDownload(item);
    }
  }, [client, runDownload, syncQueue]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);
  useEffect(() => {
    if (client) pumpRef.current?.();
  }, [client]);

  const start = useCallback(
    (item: MediaItem) => {
      if (
        !client ||
        runningRef.current.has(item.id) ||
        queueRef.current.includes(item.id) ||
        hasEntry(item.id)
      )
        return;
      activeItemsRef.current.set(item.id, item);
      syncQueue([...queueRef.current, item.id]);
      persistWanted();
      pump();
    },
    [client, hasEntry, persistWanted, pump, syncQueue],
  );

  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!client || reconciledRef.current) return;
    reconciledRef.current = true;
    void reconcileTransfers({
      client,
      isRunning: (itemId) => runningRef.current.has(itemId),
      hasEntry,
      markPaused,
      execute,
      start,
    });
  }, [client, execute, hasEntry, markPaused, start]);

  const pause = useCallback(
    (itemId: string) => {
      const handle = handlesRef.current.get(itemId);
      if (!handle) return;
      markPaused(itemId, true);
      handle.pause();
    },
    [markPaused],
  );

  const resume = useCallback(
    (itemId: string) => {
      const handle = handlesRef.current.get(itemId);
      if (!handle) return;
      markPaused(itemId, false);
      handle.resume();
    },
    [markPaused],
  );

  const cancel = useCallback(
    (itemId: string) => {
      if (queueRef.current.includes(itemId)) {
        syncQueue(queueRef.current.filter((id) => id !== itemId));
        activeItemsRef.current.delete(itemId);
        attemptsRef.current.delete(itemId);
        persistWanted();
        return;
      }
      const handle = handlesRef.current.get(itemId);
      if (!handle) {
        // Running, but no platform task yet: flag it so the transfer cancels
        // itself once it has a handle, instead of a silent no-op.
        if (runningRef.current.has(itemId)) cancelledRef.current.add(itemId);
        return;
      }
      handle.cancel();
    },
    [persistWanted, syncQueue],
  );

  return {
    entries,
    active,
    pausedIds,
    queuedIds,
    activeItems: activeItemsRef.current,
    canDownload,
    start,
    pause,
    resume,
    cancel,
    remove,
  };
}
