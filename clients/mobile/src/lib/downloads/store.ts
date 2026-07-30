// On-disk side of offline downloads: where files live, the JSON manifest that
// indexes them, and the startup reconciliation between the two.

import type { MediaItem, StoryboardManifest } from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';

export const DIR = `${FileSystem.documentDirectory}kroma-downloads/`;
const INDEX = `${DIR}index.json`;
const WANTED = `${DIR}wanted.json`;

export interface OfflineSub {
  index: number;
  language: string | null;
  label?: string;
  ai?: boolean;
  path: string;
}

export interface DownloadEntry {
  itemId: string;
  item: MediaItem;
  fileUri: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  sizeBytes: number;
  downloadedAt: string;
  subs?: OfflineSub[];
  storyboard?: { manifest: StoryboardManifest; spritePath: string };
}

export type DownloadState =
  | { status: 'none' }
  | { status: 'downloading'; progress: number }
  | { status: 'paused'; progress: number }
  | { status: 'queued' }
  | { status: 'done'; entry: DownloadEntry };

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

/** Titles the user asked for that are not yet in the index; persisted because
 * iOS cancels background tasks on force-quit and they must be requeued at the
 * next launch. */
export async function readWanted(): Promise<MediaItem[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(WANTED);
    return JSON.parse(raw) as MediaItem[];
  } catch {
    return [];
  }
}

export async function writeWanted(items: MediaItem[]): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(WANTED, JSON.stringify(items));
}

/** Deletes everything in the download directory that no index entry claims.
 * Must run after still-running platform transfers are re-adopted, so their
 * in-flight files can be passed in as `live` rather than swept. */
export async function sweepOrphans(
  entries: DownloadEntry[],
  live: Iterable<string> = [],
): Promise<void> {
  try {
    const known = new Set<string>([INDEX, WANTED]);
    for (const entry of entries) {
      known.add(entry.fileUri);
      for (const sub of entry.subs ?? []) known.add(sub.path);
      if (entry.storyboard) known.add(entry.storyboard.spritePath);
    }
    for (const uri of live) {
      known.add(uri);
      // The Android downloader stages into a sibling temp file until the
      // transfer completes.
      known.add(`${uri}.tmp`);
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
