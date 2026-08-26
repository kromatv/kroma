// Offline downloads live in the app's documents directory, indexed in a JSON
// manifest, and play back from disk. Transfers run in the platform downloader
// and survive backgrounding or a kill; iOS drops background tasks on
// force-quit, so those are requeued on launch.

import { setConfig } from '@kesha-antonov/react-native-background-downloader';
import type { KromaClient, MediaItem } from '@kroma/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { useT } from '#mobile/lib/i18n';
import { useTransferQueue } from './queue';
import type { DownloadEntry, DownloadState } from './store';

export type { DownloadEntry, DownloadState, OfflineSub } from './store';

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

  const {
    entries,
    active,
    pausedIds,
    queuedIds,
    activeItems,
    canDownload,
    start,
    pause,
    resume,
    cancel,
    remove,
  } = useTransferQueue(client);

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
        const item = activeItems.get(id);
        return item ? [{ item, progress }] : [];
      }),
    [active, activeItems, pausedIds],
  );

  const paused = useMemo(
    () =>
      pausedIds.flatMap((id) => {
        const item = activeItems.get(id);
        const progress = active[id];
        return item && progress !== undefined ? [{ item, progress }] : [];
      }),
    [active, activeItems, pausedIds],
  );

  const queuedItems = useMemo(
    () =>
      queuedIds.flatMap((id) => {
        const item = activeItems.get(id);
        return item ? [item] : [];
      }),
    [activeItems, queuedIds],
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
