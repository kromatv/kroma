// Hands a title's transfer to the platform's background downloader (NSURLSession
// on iOS, DownloadManager/data-transfer job on Android) so it survives
// backgrounding, then validates the result. Throws on failure; the caller owns
// queueing and UI state.

import {
  completeHandler,
  createDownloadTask,
  type DownloadTask,
} from '@kesha-antonov/react-native-background-downloader';
import type { KromaClient, MediaItem } from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';
import { canRawDownload, downloadCopyCodecs, downloadVideoCodecs } from '#mobile/player/caps';
import { fetchSidecars } from './sidecars';
import { type DownloadEntry, ensureDir, mediaPath } from './store';

// Below this, it's a failure response that happened to answer with media headers.
const MIN_PLAUSIBLE_BYTES = 512 * 1024;

// A user-initiated cancel, which must stay silent.
export const CANCELLED = 'cancelled';

/** A network-shaped failure: the connection died, not the content. The caller
 * requeues and retries instead of surfacing an error the user can't act on. */
export class TransferInterrupted extends Error {}

// iOS NSURLError codes for "the network went away mid-transfer"; background
// sessions absorb most of these on their own, this catches the rest.
const RETRYABLE_IOS = new Set([-1001, -1003, -1004, -1005, -1009, -1020]);
// Android DownloadManager codes: unknown, HTTP data error, cannot resume.
const RETRYABLE_ANDROID = new Set([1000, 1004, 1008]);

function isNetworkFailure(error: string, code: number): boolean {
  return (
    RETRYABLE_IOS.has(code) ||
    RETRYABLE_ANDROID.has(code) ||
    /network|connection|internet|timed? ?out|unreachable|ECONNRESET|ETIMEDOUT|ENETDOWN|socket/i.test(
      error,
    )
  );
}

/** The caller's grip on a running platform transfer. Pause parks the task with
 * native resume data (kept across app restarts); resume picks it back up. */
export interface TransferHandle {
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface TransferHooks {
  onTask(handle: TransferHandle): boolean;
  onProgress(frac: number): void;
}

/** Stored as the native task's metadata, so a transfer that outlives the app
 * can be re-adopted from its own snapshot on the next launch. */
export interface TransferMeta {
  item: MediaItem;
  fileUri: string;
  raw: boolean;
  estimatedTotal: number | null;
}

function buildMeta(item: MediaItem): TransferMeta {
  // Raw original only when everything in it plays offline on this device;
  // otherwise the server remuxes, narrowing codecs to what this device decodes.
  const raw = canRawDownload(item);
  // The remux stream is chunked (no Content-Length); the source file size is a
  // solid estimate since video bytes are copied verbatim.
  const estimatedTotal =
    item.files.find((f) => f.id === item.defaultFileId)?.size ?? item.files[0]?.size ?? null;
  return {
    item,
    raw,
    estimatedTotal,
    fileUri: mediaPath(item.id, raw ? (item.container || 'mp4').toLowerCase() : 'mp4'),
  };
}

/** Null when the task was not created by this code, or predates this format. */
export function transferMetaOf(task: DownloadTask): TransferMeta | null {
  const meta = task.metadata as Partial<TransferMeta> | null;
  return meta?.item && typeof meta.fileUri === 'string' && typeof meta.raw === 'boolean'
    ? (meta as TransferMeta)
    : null;
}

// A remux is a live ffmpeg stream that can never resume mid-byte; iOS quietly
// parks the task instead of failing it, which looks like a frozen download
// without this watchdog. A resume that moves no bytes within this window is
// declared dead and the title restarts.
const RESUME_STALL_MS = 20_000;

function driveTask(
  task: DownloadTask,
  meta: TransferMeta,
  hooks: TransferHooks,
  fresh: boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    };
    const fail = (err: Error) => {
      clearWatchdog();
      void task.stop().catch(() => undefined);
      reject(err);
    };
    task.begin(({ headers }) => {
      // A server without /download answers with the SPA HTML shell (200 text/html);
      // reject anything that isn't media bytes.
      const contentType = Object.entries(headers).find(
        ([k]) => k.toLowerCase() === 'content-type',
      )?.[1];
      if (contentType && !/video\/|octet-stream|matroska/i.test(contentType)) {
        fail(new Error(`not a media response: ${contentType}`));
      }
    });
    task.progress(({ bytesDownloaded, bytesTotal }) => {
      clearWatchdog();
      const total = bytesTotal > 0 ? bytesTotal : meta.estimatedTotal;
      hooks.onProgress(total && total > 0 ? Math.min(0.99, bytesDownloaded / total) : -1);
    });
    task.done(() => {
      clearWatchdog();
      // Releases iOS's stored background-session completion handler.
      completeHandler(task.id);
      resolve();
    });
    task.error(({ error, errorCode }) => {
      clearWatchdog();
      const message = `${error} (code ${errorCode})`;
      reject(
        isNetworkFailure(error, errorCode) ? new TransferInterrupted(message) : new Error(message),
      );
    });
    const handle: TransferHandle = {
      cancel: () => fail(new Error(CANCELLED)),
      // A user pause emits no event (native swallows the -999); the promise
      // stays pending until resume or cancel.
      pause: () => {
        clearWatchdog();
        void task.pause().catch(() => undefined);
      },
      resume: () => {
        void task.resume().catch((e) => reject(new TransferInterrupted(String(e))));
        clearWatchdog();
        watchdog = setTimeout(
          () => fail(new TransferInterrupted('resume moved no bytes')),
          RESUME_STALL_MS,
        );
      },
    };
    if (!hooks.onTask(handle)) {
      fail(new Error(CANCELLED));
      return;
    }
    // A reattached task may have ended before its handlers were rewired, with
    // its events gone; settle from the state snapshot instead.
    if (task.state === 'DONE') resolve();
    else if (task.state === 'FAILED' || task.state === 'STOPPED')
      reject(new TransferInterrupted('transfer died while unattended'));
    else if (fresh) task.start();
    // else a reattached PAUSED task stays parked until the user resumes it.
  });
}

// A resolved transfer is not proof the file is whole: a chunked remux that dies
// mid-stream closes the connection cleanly, with no Content-Length to contradict
// it. A raw download's size is known exactly; a remux only gets a floor, since
// AAC-transcoding a lossless track can legitimately shrink the file a lot.
async function finalizeTransfer(client: KromaClient, meta: TransferMeta): Promise<DownloadEntry> {
  const { item, fileUri, raw, estimatedTotal } = meta;
  const info = await FileSystem.getInfoAsync(fileUri);
  const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
  if (raw && estimatedTotal && size !== estimatedTotal) {
    throw new Error(`truncated: ${size} of ${estimatedTotal} bytes`);
  }
  if (size < MIN_PLAUSIBLE_BYTES) throw new Error(`truncated: ${size} bytes`);

  const { subs, storyboard } = await fetchSidecars(client, item);
  return {
    itemId: item.id,
    item,
    fileUri,
    posterUrl: client.posterFor(item),
    backdropUrl: client.backdropFor(item),
    sizeBytes: size,
    downloadedAt: new Date().toISOString(),
    subs,
    storyboard,
  };
}

export async function runTransfer(
  client: KromaClient,
  item: MediaItem,
  hooks: TransferHooks,
): Promise<DownloadEntry> {
  const meta = buildMeta(item);
  try {
    await ensureDir();
    const url = meta.raw
      ? client.streamUrl(item.id)
      : client.downloadUrl(item.id, downloadCopyCodecs(), downloadVideoCodecs());
    // `/download` is session-gated (it costs a server-side ffmpeg for the length
    // of a film), and this transfer is owned by the platform downloader, so the
    // bearer has to be attached by hand.
    const task = createDownloadTask({
      id: item.id,
      url,
      destination: meta.fileUri,
      headers: client.authHeaders(),
      metadata: meta,
    });
    await driveTask(task, meta, hooks, true);
    return await finalizeTransfer(client, meta);
  } catch (err) {
    // Nothing half-written survives a failure: the file would otherwise be an
    // orphan no index entry claims.
    await FileSystem.deleteAsync(meta.fileUri, { idempotent: true }).catch(() => undefined);
    throw err;
  }
}

/** Re-adopt a transfer the platform kept alive (or finished) while the app was
 * away: rewire its events into fresh hooks, or just validate and index the
 * file if the task already completed. */
export async function adoptTransfer(
  client: KromaClient,
  task: DownloadTask,
  meta: TransferMeta,
  hooks: TransferHooks,
): Promise<DownloadEntry> {
  try {
    if (task.state === 'DONE') completeHandler(task.id);
    else await driveTask(task, meta, hooks, false);
    return await finalizeTransfer(client, meta);
  } catch (err) {
    await FileSystem.deleteAsync(meta.fileUri, { idempotent: true }).catch(() => undefined);
    throw err;
  }
}
