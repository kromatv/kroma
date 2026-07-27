// Offline downloads into the app's documents directory, indexed in a small
// JSON manifest and played back by the engine straight from disk. When the
// device can direct-play the original file it is downloaded RAW (byte-identical,
// zero server work); otherwise the server's /download endpoint remuxes it on
// the fly to a fragmented MP4 the phone can decode, so EVERY title is
// downloadable on every platform.
//
// Transfers belong to the platform downloader, not to this JS: they keep
// running while the app is backgrounded or killed. On launch the provider
// re-adopts whatever the platform kept alive (or finished, or sits paused on
// native resume data) and requeues whatever it could not (iOS drops background
// tasks on force-quit), so a started download always either completes or
// restarts - never vanishes. A network drop is not a failure either: the title
// goes back in the queue and retries when connectivity returns.

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

/** One transfer at a time: a season enqueued in bulk must not spawn a remux
 * ffmpeg per episode on the server. */
const MAX_CONCURRENT = 1;

interface DownloadsApi {
  entries: DownloadEntry[];
  /** Currently downloading titles (progress -1 = size unknown). */
  downloading: { item: MediaItem; progress: number }[];
  /** User-paused titles, held on native resume data. */
  paused: { item: MediaItem; progress: number }[];
  /** Titles waiting in the download queue (one transfer runs at a time). */
  queuedItems: MediaItem[];
  stateFor(itemId: string): DownloadState;
  /** Whether this item can be taken offline on this device at all. */
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
  // Mirrors `entries` for the handlers, so persistence stays OUT of the state
  // updater: a reducer that also writes files runs twice under StrictMode and
  // is skipped entirely when the React Compiler memoizes the render.
  const entriesRef = useRef<DownloadEntry[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const activeItemsRef = useRef<Map<string, MediaItem>>(new Map());
  const handlesRef = useRef<Map<string, TransferHandle>>(new Map());
  const pausedRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<string[]>([]);
  /** Cancels that arrived before the transfer had a handle to cancel. */
  const cancelledRef = useRef<Set<string>>(new Set());
  /** Consecutive network-interrupt count per title, for retry backoff. */
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // The index is readable without a session, so downloaded titles show up
  // even when the app launches offline. Reconciliation with the platform
  // downloader waits for the client (it needs auth for sidecars / restarts).
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

  /** The single write path for the index: ref, state and disk together. */
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

  /** Persist the running + queued titles so an app kill loses no request:
   * whatever the platform can't finish on its own is requeued at next boot. */
  const persistWanted = useCallback(() => {
    const ids = [...runningRef.current, ...queueRef.current];
    void writeWanted(
      ids.flatMap((id) => {
        const item = activeItemsRef.current.get(id);
        return item ? [item] : [];
      }),
    );
  }, []);

  /** Publish one transfer's progress fraction on the active map. */
  const trackProgress = useCallback((itemId: string, frac: number) => {
    setActive((a) => ({ ...a, [itemId]: frac }));
  }, []);

  // The remux endpoint makes every title downloadable; keep the check for the
  // rare item with no file at all.
  const canDownload = useCallback(
    (item: MediaItem) => item.files.length > 0 || !!item.container,
    [],
  );

  /** A retry never hammers a dead network: exponential backoff, and the
   * connectivity listener pumps the queue the moment the network is back. */
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

  /** Own one transfer's lifecycle - fresh or re-adopted - from hooks to entry. */
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
              // A cancel that landed while the task was being created has no
              // handle to act on; honour it now instead of downloading anyway.
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
            // The network died, not the download: back in the queue, retried
            // on backoff or the moment connectivity returns. No alert - there
            // is nothing the user can do about a tunnel.
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

  // pump() lives behind a ref so runDownload's finally can call the latest one.
  // Written in an effect, never during render: a ref mutated in the render body
  // goes stale the moment a render is memoized away or replayed.
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

  // Once per session: reconcile with the platform downloader. Adopt what it
  // kept alive, finished or paused while the app was away, THEN sweep orphans
  // (a live partial file is not an orphan), then requeue what did not survive.
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
        // Only a task the platform still runs (or finished, or parked on
        // resume data) is adoptable. Anything else - foreign metadata, already
        // indexed, died natively - is dropped here and, if still wanted,
        // restarted cleanly below.
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
      // Still queued: just drop it from the queue.
      if (queueRef.current.includes(itemId)) {
        syncQueue(queueRef.current.filter((id) => id !== itemId));
        activeItemsRef.current.delete(itemId);
        attemptsRef.current.delete(itemId);
        persistWanted();
        return;
      }
      const handle = handlesRef.current.get(itemId);
      if (!handle) {
        // Running, but the platform task doesn't exist yet: leave a note that
        // the transfer checks the moment it has one. Without this the tap is a
        // silent no-op and the spinner never clears.
        if (runningRef.current.has(itemId)) cancelledRef.current.add(itemId);
        return;
      }
      // The handle stops the platform task and fails the in-flight transfer,
      // which runs the failure path (no entry registered, spinner cleared,
      // file gone).
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
