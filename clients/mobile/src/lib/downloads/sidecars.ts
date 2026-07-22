// Best-effort extras fetched alongside a downloaded title: subtitle tracks and
// the storyboard sprite, so the offline player keeps subtitles and scrub
// previews. Every failure here costs the extra, never the download.

import { isTextSubtitle, type KromaClient, type MediaItem } from '@kroma/core';
import * as FileSystem from 'expo-file-system/legacy';
import { type DownloadEntry, mediaPath, type OfflineSub } from './store';

export interface Sidecars {
  subs: OfflineSub[];
  storyboard?: DownloadEntry['storyboard'];
}

/** Embedded text subtitles (by track index) plus any AI-generated ones the
 * server has already produced. Image subtitles (PGS) are skipped: they can't be
 * converted, so there is nothing to take offline. */
async function fetchSubs(client: KromaClient, item: MediaItem): Promise<OfflineSub[]> {
  const subs: OfflineSub[] = [];
  for (const [index, sub] of item.subtitles.entries()) {
    if (!isTextSubtitle(sub.codec)) continue;
    const path = mediaPath(item.id, `e${index}.vtt`);
    try {
      await FileSystem.downloadAsync(client.subtitleUrl(item.id, index), path);
      subs.push({ index, language: sub.language, path });
    } catch {
      // Track unavailable offline.
    }
  }
  try {
    const generated = await client.downloadedSubtitles(item.id);
    for (const [i, gen] of generated.entries()) {
      const path = mediaPath(item.id, `g${i}.vtt`);
      await FileSystem.downloadAsync(client.resolveArt(gen.url) ?? gen.url, path);
      // Offset well past the embedded track indices so the two namespaces
      // can't collide in the offline picker.
      subs.push({ index: 1000 + i, language: gen.language, label: gen.label, ai: true, path });
    }
  } catch {
    // No generated subtitles offline.
  }
  return subs;
}

async function fetchStoryboard(
  client: KromaClient,
  item: MediaItem,
): Promise<DownloadEntry['storyboard']> {
  try {
    const manifest = await client.storyboard(item.id);
    if (!manifest || manifest === 'pending') return undefined;
    const spritePath = mediaPath(item.id, 'sb.img');
    await FileSystem.downloadAsync(client.resolveArt(manifest.url) ?? manifest.url, spritePath);
    return { manifest, spritePath };
  } catch {
    return undefined;
  }
}

export async function fetchSidecars(client: KromaClient, item: MediaItem): Promise<Sidecars> {
  const [subs, storyboard] = await Promise.all([
    fetchSubs(client, item),
    fetchStoryboard(client, item),
  ]);
  return { subs, storyboard };
}
