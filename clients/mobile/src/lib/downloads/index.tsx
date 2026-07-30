// Offline downloads live in the app's documents directory, indexed in a JSON
// manifest, and play back from disk. Transfers run in the platform downloader
// and survive backgrounding or a kill; iOS drops background tasks on
// force-quit, so those are requeued on launch.

import {
  getExistingDownloadTasks,
  setConfig,
} from '@kesha-antonov/react-native-background-downloader';
import type { KromaClient, MediaItem } from '@kroma/core';
import * as Network from 'expo-network';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import {
  type DownloadEntry,
  type DownloadState,
  deleteEntryFiles,
  readIndex,
  readWanted,
  sweepOrphans,
  writeIndex,
  writeWanted,
} from './store';
import {
  adoptTransfer,
  CANCELLED,
  runTransfer,
  type TransferHandle,
  type TransferHooks,
  TransferInterrupted,
  transferMetaOf,
} from './transfer';

export type { DownloadEntry, DownloadState, OfflineSub } from './store';
export { formatBytes } from './store';

// One transfer at a time: a season enqueued in bulk must not spawn a remux
// ffmpeg per episode on the server.
const MAX_CONCURRENT = 1;

interface DownloadsApi {
  entries: DownloadEntry[];
  downloading: { item: MediaItem; progress: number }[];
  paused: { item: MediaItem; progress: number }[];
  queuedItems: MediaItem[];
  stateFor(itemId: string): DownloadState;
  canDownload(item: MediaItem): boolean;
  start(item: MediaItem): void;
  pause(itemId: string): void;
  resume(itemId: string): void;
  cancel(itemId: string): void;
  remove(itemId: string): Promise<void>;
  totalBytes: number;
}

const Ctx = createContext<DownloadsApi | null>(null);

export function useDownloads(): DownloadsApi {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDownloads outside DownloadsProvider');
  return value;
}

export function DownloadsProvider({
  client,
  children,
}: Readonly<{
  client: KromaClient | null;
  children: ReactNode;
}>) {
  const t = useT();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [active, setActive] = useState<Record<string, number>>({});
  const [pausedIds, setPausedIds] = useState<string[]>([]);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  // Mirrors `entries` for the handlers, keeping persistence out of the state
  // updater: a reducer that also writes files runs twice under StrictMode.
  const entriesRef = useRef<DownloadEntry[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const activeItemsRef = useRef<Map<string, MediaItem>>(new Map());
  const handlesRef = useRef<Map<string, TransferHandle>>(new Map());
  const pausedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // The index is readable without a session, so downloaded titles show up even
  // when the app launches offline; reconciliation waits for the client.
  useEffect(() => {
    void (async () => {
      const stored = await readIndex();
      // A fast adoption may have committed an entry already; never clobber it.
      if (entriesRef.current.length === 0) {
        entriesRef.current = stored;
        setEntries(stored);
      }
    })();
  }, []);

  // Android surfaces its transfer notifications itself; give it the app's
  // language instead of the library's built-in English.
  useEffect(() => {
    setConfig({
      showNotificationsEnabled: true,
      notificationsGrouping: {
        enabled: false,
        texts: {
          downloadTitle: t('offline.download'),
          downloadStarting: t('offline.queued'),
          downloadProgress: t('offline.downloading', { percent: '{progress}' }),
          downloadPaused: t('offline.paused'),
          downloadFinished: t('offline.downloaded'),
          groupTitle: t('offline.downloads'),
        },
      },
    });
  }, [t]);

  const commitEntries = useCallback((next: DownloadEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    void writeIndex(next);
  }, []);

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
          commitEntries([...entriesRef.current.filter((e) => e.itemId !== item.id), entry]);
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
    [commitEntries, markPaused, persistWanted, scheduleRetry, syncQueue, trackProgress, t],
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
    while (runningRef.current.size < MAX_CONCURRENT && queueRef.current.length > 0) {
      const [id, ...rest] = queueRef.current;
      if (!id) break;
      syncQueue(rest);
      const item = activeItemsRef.current.get(id);
      if (item) runDownload(item);
    }
  }, [runDownload, syncQueue]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const start = useCallback(
    (item: MediaItem) => {
      if (
        !client ||
        runningRef.current.has(item.id) ||
        queueRef.current.includes(item.id) ||
        entriesRef.current.some((e) => e.itemId === item.id)
      )
        return;
      activeItemsRef.current.set(item.id, item);
      syncQueue([...queueRef.current, item.id]);
      persistWanted();
      pump();
    },
    [client, persistWanted, pump, syncQueue],
  );

  // Once per session: adopt what the platform kept alive/finished/paused, THEN
  // sweep orphans (a live partial file is not one), then requeue the rest.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!client || reconciledRef.current) return;
    reconciledRef.current = true;
    void (async () => {
      const stored = await readIndex();
      const tasks = await getExistingDownloadTasks().catch(() => []);
      const live: string[] = [];
      for (const task of tasks) {
        const meta = transferMetaOf(task);
        // Only a task the platform still runs (or finished, or paused) is
        // adoptable; anything else is dropped and, if still wanted, restarted.
        const adoptable =
          task.state === 'DOWNLOADING' || task.state === 'PAUSED' || task.state === 'DONE';
        if (!meta || !adoptable || stored.some((e) => e.itemId === meta.item.id)) {
          void task.stop().catch(() => undefined);
          continue;
        }
        live.push(meta.fileUri);
        if (task.state === 'PAUSED') markPaused(meta.item.id, true);
        const seed =
          task.bytesTotal > 0 ? Math.min(0.99, task.bytesDownloaded / task.bytesTotal) : -1;
        execute(meta.item, (hooks) => adoptTransfer(client, task, meta, hooks), seed);
      }
      await sweepOrphans(stored, live);
      for (const item of await readWanted()) {
        if (
          !runningRef.current.has(item.id) &&
          !stored.some((e) => e.itemId === item.id) &&
          !entriesRef.current.some((e) => e.itemId === item.id)
        )
          start(item);
      }
    })();
  }, [client, execute, markPaused, start]);

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

  const remove = useCallback(
    async (itemId: string) => {
      const entry = entriesRef.current.find((e) => e.itemId === itemId);
      commitEntries(entriesRef.current.filter((e) => e.itemId !== itemId));
      if (entry) await deleteEntryFiles(entry);
    },
    [commitEntries],
  );

  const stateFor = useCallback(
    (itemId: string): DownloadState => {
      const progress = active[itemId];
      if (progress !== undefined) {
        if (pausedIds.includes(itemId)) return { status: 'paused', progress };
        return { status: 'downloading', progress };
      }
      if (queuedIds.includes(itemId)) return { status: 'queued' };
      const entry = entries.find((e) => e.itemId === itemId);
      return entry ? { status: 'done', entry } : { status: 'none' };
    },
    [active, entries, pausedIds, queuedIds],
  );

  const totalBytes = useMemo(() => entries.reduce((sum, e) => sum + e.sizeBytes, 0), [entries]);

  const downloading = useMemo(
    () =>
      Object.entries(active).flatMap(([id, progress]) => {
        if (pausedIds.includes(id)) return [];
        const item = activeItemsRef.current.get(id);
        return item ? [{ item, progress }] : [];
      }),
    [active, pausedIds],
  );

  const paused = useMemo(
    () =>
      pausedIds.flatMap((id) => {
        const item = activeItemsRef.current.get(id);
        const progress = active[id];
        return item && progress !== undefined ? [{ item, progress }] : [];
      }),
    [active, pausedIds],
  );

  const queuedItems = useMemo(
    () =>
      queuedIds.flatMap((id) => {
        const item = activeItemsRef.current.get(id);
        return item ? [item] : [];
      }),
    [queuedIds],
  );

  const value = useMemo<DownloadsApi>(
    () => ({
      entries,
      downloading,
      paused,
      queuedItems,
      stateFor,
      canDownload,
      start,
      pause,
      resume,
      cancel,
      remove,
      totalBytes,
    }),
    [
      entries,
      downloading,
      paused,
      queuedItems,
      stateFor,
      canDownload,
      start,
      pause,
      resume,
      cancel,
      remove,
      totalBytes,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
