// One title, taken offline: pick the source, run the platform transfer, prove
// the result is a whole media file, and collect the sidecars. Everything that
// can go wrong throws; the caller owns queueing and UI state.

import type { KromaClient, MediaItem } from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';
import { canRawDownload, downloadCopyCodecs } from '../../player/caps';
import { fetchSidecars } from './sidecars';
import { type DownloadEntry, ensureDir, mediaPath } from './store';

/** Anything smaller than this is not a film, it is a failure that happened to
 * answer with media headers. */
const MIN_PLAUSIBLE_BYTES = 512 * 1024;

/** Thrown for a user-initiated cancel, which must stay silent. */
export const CANCELLED = 'cancelled';

export interface TransferHooks {
  /** Called once the platform task exists. Return false to abort: a cancel that
   * arrived before there was anything to cancel. */
  onTask(task: FileSystem.DownloadResumable): boolean;
  /** 0..1, or -1 while the total size is unknown (the server remux is chunked). */
  onProgress(frac: number): void;
}

export async function runTransfer(
  client: KromaClient,
  item: MediaItem,
  hooks: TransferHooks,
): Promise<DownloadEntry> {
  // Raw original when EVERYTHING in it plays offline on this device; otherwise
  // the server remuxes to an fMP4 keeping every audio track, copy-codecs
  // narrowed to what this device decodes so no downloaded track is dead.
  const raw = canRawDownload(item);
  const fileUri = mediaPath(item.id, raw ? (item.container || 'mp4').toLowerCase() : 'mp4');
  try {
    await ensureDir();
    const url = raw ? client.streamUrl(item.id) : client.downloadUrl(item.id, downloadCopyCodecs());
    // The remux stream is chunked (no Content-Length), but the source file size
    // is a solid estimate: video bytes are copied verbatim. Cap at 99% so the
    // ring only completes when the download does.
    const estimatedTotal =
      item.files.find((f) => f.id === item.defaultFileId)?.size ?? item.files[0]?.size ?? null;
    // `/download` is session-gated (it costs a server-side ffmpeg for the length
    // of a film), and this transfer is owned by the platform downloader, so the
    // bearer has to be attached by hand.
    const task = FileSystem.createDownloadResumable(
      url,
      fileUri,
      { headers: client.authHeaders() },
      (p) => {
        const total =
          p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : estimatedTotal;
        hooks.onProgress(total && total > 0 ? Math.min(0.99, p.totalBytesWritten / total) : -1);
      },
    );
    if (!hooks.onTask(task)) throw new Error(CANCELLED);

    const result = await task.downloadAsync();
    if (!result) throw new Error(CANCELLED);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`server answered ${result.status}`);
    }
    // A server without the /download endpoint answers with the SPA HTML shell
    // (200 text/html): reject anything that is not media bytes so a garbage file
    // is never registered as a finished download.
    const contentType = Object.entries(result.headers).find(
      ([k]) => k.toLowerCase() === 'content-type',
    )?.[1];
    if (contentType && !/video\/|octet-stream|matroska/i.test(contentType)) {
      throw new Error(`not a media response: ${contentType}`);
    }

    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
    // The transfer resolving is NOT proof the file is whole: a chunked remux
    // that dies mid-stream (ffmpeg killed, disk full, Wi-Fi drop) closes the
    // connection cleanly, with no Content-Length to contradict it. A raw
    // download is a byte copy, so its size is known exactly; for a remux only a
    // floor is safe, since AAC-transcoding a lossless track can legitimately
    // shrink the file a lot.
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
  } catch (err) {
    // Nothing half-written survives a failure: the file would otherwise be an
    // orphan no index entry claims.
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    throw err;
  }
}
