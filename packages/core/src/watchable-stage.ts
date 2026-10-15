import type {
  DownloadId,
  WatchableApi,
  WatchableProbe,
  WatchableStartBody,
  WatchableStartOutcome,
  WatchableTicket,
} from '@kromatv/client/watchable';
import type { WatchableTarget } from './watchable';

/** `file` is the index the entry lists it under, null for the feature. */
export type WatchSubject =
  | { kind: 'title'; title: WatchableStartBody }
  | { kind: 'download'; downloadId: DownloadId; file: number | null };

export const subjectTitle = (subject: WatchSubject): string | null =>
  subject.kind === 'title' ? subject.title.title : null;

type WatchFailure = 'noSource' | 'noIndexer' | 'unsupported' | 'failed';

interface WatchProgressing {
  release: string | null;
  downloadId: DownloadId | null;
}

export type WatchStage =
  | (WatchProgressing & { stage: 'searching' })
  | (WatchProgressing & { stage: 'connecting' })
  | (WatchProgressing & { stage: 'buffering'; target: WatchableTarget })
  | (WatchProgressing & {
      stage: 'ready';
      target: WatchableTarget;
      probe: WatchableProbe;
      ticket: WatchableTicket;
    })
  | { stage: 'failed'; failure: WatchFailure; message: string | null };

export type WatchReady = Extract<WatchStage, { stage: 'ready' }>;

export type Settled<T> = T | 'pending' | 'failed';

const failed = (failure: WatchFailure, message: string | null = null): WatchStage => ({
  stage: 'failed',
  failure,
  message,
});

export const WATCH_UNSUPPORTED: WatchStage = failed('unsupported');

export function startedDownload(
  start: Settled<WatchableStartOutcome>,
): Extract<WatchableStartOutcome, { kind: 'started' }> | null {
  return typeof start === 'object' && start.kind === 'started' ? start : null;
}

/** Null once a download is running, or may be where the server stopped
 * waiting, which {@link downloadStage} takes from there. */
export function startStage(start: Settled<WatchableStartOutcome>): WatchStage | null {
  if (start === 'pending') return { stage: 'searching', release: null, downloadId: null };
  if (start === 'failed') return failed('failed');
  if (start.kind === 'noIndexer') return failed('noIndexer', start.message);
  if (start.kind === 'noRelease') return failed('noSource', start.message);
  return null;
}

export function downloadStage({
  downloadId,
  release,
  target,
  probe,
  ticket,
}: Readonly<{
  downloadId: DownloadId | null;
  release: string | null;
  target: WatchableTarget | null;
  probe: Settled<WatchableProbe>;
  ticket: Settled<WatchableTicket>;
}>): WatchStage {
  const named = { release, downloadId: target?.entry.id ?? downloadId };
  if (!target) return { stage: 'connecting', ...named };
  if (probe === 'failed' || ticket === 'failed') return failed('failed');
  if (probe === 'pending' || ticket === 'pending') return { stage: 'buffering', ...named, target };
  return { stage: 'ready', ...named, target, probe, ticket };
}

export function watchRelease(ready: WatchReady, title: string): string | null {
  const named = ready.release ?? ready.target.file.name;
  return named === title ? null : named;
}

export function stageDownload(stage: WatchStage): DownloadId | null {
  return stage.stage === 'failed' ? null : stage.downloadId;
}

/** Erase the download the screen was waiting on. True where the module erased
 * it; a refusal and a failure both answer false. */
export async function cancelWatch(
  watchable: Pick<WatchableApi, 'cancel'> | null | undefined,
  stage: WatchStage,
): Promise<boolean> {
  const download = stageDownload(stage);
  if (!watchable || !download) return false;
  return watchable.cancel(download).catch(() => false);
}
