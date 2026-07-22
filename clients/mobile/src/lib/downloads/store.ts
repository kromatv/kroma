// On-disk side of offline downloads: where files live, the JSON manifest that
// indexes them, and the startup reconciliation between the two.

import type { MediaItem, StoryboardManifest } from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';

export const DIR = `${FileSystem.documentDirectory}kroma-downloads/`;
const INDEX = `${DIR}index.json`;

export interface OfflineSub {
  index: number;
  language: string | null;
  label?: string;
  ai?: boolean;
  /** Local file URI of the WebVTT. */
  path: string;
}

export interface DownloadEntry {
  itemId: string;
  /** Snapshot of the item for fully offline rendering. */
  item: MediaItem;
  fileUri: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  sizeBytes: number;
  downloadedAt: string;
  /** Sidecar subtitle tracks downloaded with the media (absent on old entries). */
  subs?: OfflineSub[];
  /** Sidecar storyboard (scrub previews) when the server had one ready. */
  storyboard?: { manifest: StoryboardManifest; spritePath: string };
}

export type DownloadState =
  | { status: 'none' }
  /** progress is 0..1, or -1 when the total size is unknown (server remux). */
  | { status: 'downloading'; progress: number }
  | { status: 'queued' }
  | { status: 'done'; entry: DownloadEntry };

/** Local media path for an item. The extension matters: the raw path keeps the
 * original container, the remux is always MP4. */
export function mediaPath(itemId: string, ext: string): string {
  return `${DIR}${itemId}.${ext}`;
}

export async function ensureDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
}

export async function readIndex(): Promise<DownloadEntry[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX);
    return JSON.parse(raw) as DownloadEntry[];
  } catch {
    return [];
  }
}

export async function writeIndex(entries: DownloadEntry[]): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(entries));
}

/** Delete everything in the download directory that no index entry claims.
 *
 * A transfer killed with the app (swipe-away, OOM, reboot) leaves its partial
 * file behind with no entry pointing at it: invisible to `remove()`, uncounted
 * in the storage total, and never cleaned up. On a 20 GB film that is 20 GB the
 * user cannot reclaim from inside the app. Runs once at startup, when no
 * transfer is in flight, so a live download can't be swept out from under
 * itself. */
export async function sweepOrphans(entries: DownloadEntry[]): Promise<void> {
  try {
    const known = new Set<string>([INDEX]);
    for (const entry of entries) {
      known.add(entry.fileUri);
      for (const sub of entry.subs ?? []) known.add(sub.path);
      if (entry.storyboard) known.add(entry.storyboard.spritePath);
    }
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(
      names
        .map((name) => `${DIR}${name}`)
        .filter((uri) => !known.has(uri))
        .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)),
    );
  } catch {
    // No directory yet, or an unreadable one: nothing to reclaim.
  }
}

/** Drop an entry's media file and every sidecar it owns. */
export async function deleteEntryFiles(entry: DownloadEntry): Promise<void> {
  const paths = [
    entry.fileUri,
    ...(entry.subs ?? []).map((s) => s.path),
    ...(entry.storyboard ? [entry.storyboard.spritePath] : []),
  ];
  await Promise.all(
    paths.map((p) => FileSystem.deleteAsync(p, { idempotent: true }).catch(() => undefined)),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
