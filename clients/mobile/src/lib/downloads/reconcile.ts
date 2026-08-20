import { getExistingDownloadTasks } from '@kesha-antonov/react-native-background-downloader';
import type { KromaClient, MediaItem } from '@kroma/core';
import { type DownloadEntry, readIndex, readWanted, sweepOrphans } from './store';
import { adoptTransfer, type TransferHooks, transferMetaOf } from './transfer';

// Once per session: adopt what the platform kept alive/finished/paused, THEN
// sweep orphans (a live partial file is not one), then requeue the rest.
export async function reconcileTransfers({
  client,
  isRunning,
  hasEntry,
  markPaused,
  execute,
  start,
}: Readonly<{
  client: KromaClient;
  isRunning(itemId: string): boolean;
  hasEntry(itemId: string): boolean;
  markPaused(itemId: string, on: boolean): void;
  execute(
    item: MediaItem,
    run: (hooks: TransferHooks) => Promise<DownloadEntry>,
    startingProgress: number,
  ): void;
  start(item: MediaItem): void;
}>): Promise<void> {
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
    const seed = task.bytesTotal > 0 ? Math.min(0.99, task.bytesDownloaded / task.bytesTotal) : -1;
    execute(meta.item, (hooks) => adoptTransfer(client, task, meta, hooks), seed);
  }
  await sweepOrphans(stored, live);
  for (const item of await readWanted()) {
    if (!isRunning(item.id) && !stored.some((e) => e.itemId === item.id) && !hasEntry(item.id))
      start(item);
  }
}
