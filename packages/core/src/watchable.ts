import type { RequestId, RequestKind } from '@kromatv/client/requests';
import type {
  DownloadId,
  WatchableEntry,
  WatchableFile,
  WatchableStartBody,
} from '@kromatv/client/watchable';

export interface WatchableTarget {
  entry: WatchableEntry;
  file: WatchableFile;
}

type WantedEpisode = Readonly<Pick<WatchableFile, 'season' | 'episode'>>;

/** The video holding the episode `wanted` names, else the largest video in the
 * download: a release often carries a sample beside the feature and the server
 * lists both, so size is what tells them apart. */
export function featureFile(
  entry: WatchableEntry,
  wanted: WantedEpisode | null = null,
): WatchableFile | null {
  let largest: WatchableFile | null = null;
  for (const file of entry.files) {
    if (!file.isVideo) continue;
    if (wanted?.episode != null && file.season === wanted.season && file.episode === wanted.episode)
      return file;
    if (!largest || file.sizeBytes > largest.sizeBytes) largest = file;
  }
  return largest;
}

/** The download `id` and the file in it a viewer means: the file `wanted` names
 * by the index the entry lists it under, else the feature holding the episode it
 * names. Null while the server has no file list yet. */
export function watchableTarget(
  entries: readonly WatchableEntry[],
  id: DownloadId | null,
  wanted: number | WantedEpisode | null = null,
): WatchableTarget | null {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return null;
  const chosen =
    typeof wanted === 'number'
      ? entry.files.find((candidate) => candidate.index === wanted && candidate.isVideo)
      : featureFile(entry, wanted);
  return chosen ? { entry, file: chosen } : null;
}

type WantedTitle = Readonly<Pick<WatchableStartBody, 'tmdbId' | 'kind' | 'season' | 'episode'>>;

const holdsEpisode = (entry: WatchableEntry, { season, episode }: WantedTitle): boolean =>
  entry.files.some((file) => file.isVideo && file.season === season && file.episode === episode);

/** The download the server lists for what was asked: a film by its TMDB id, an
 * episode by a download of the show holding a video of that very episode, so
 * another episode of the same show is never taken for it. */
export function downloadOfTitle(
  entries: readonly WatchableEntry[],
  asked: WantedTitle,
): DownloadId | null {
  const found = entries.find(
    (entry) =>
      entry.tmdbId === asked.tmdbId && (asked.kind === 'movie' || holdsEpisode(entry, asked)),
  );
  return found?.id ?? null;
}

export function watchableTargets(entries: readonly WatchableEntry[]): WatchableTarget[] {
  const targets: WatchableTarget[] = [];
  for (const entry of entries) {
    const file = featureFile(entry);
    if (file) targets.push({ entry, file });
  }
  return targets;
}

export function watchableByRequest(
  entries: readonly WatchableEntry[],
): ReadonlyMap<RequestId, WatchableTarget> {
  const byRequest = new Map<RequestId, WatchableTarget>();
  for (const target of watchableTargets(entries)) {
    const { requestId } = target.entry;
    if (requestId && !byRequest.has(requestId)) byRequest.set(requestId, target);
  }
  return byRequest;
}

export function watchableTitle(
  {
    kind,
    tmdbId,
    title,
    year,
  }: Readonly<{ kind: RequestKind; tmdbId: number | null; title: string; year: number | null }>,
  at: Readonly<{ season: number; episode: number }> | null = null,
): WatchableStartBody | null {
  if (tmdbId == null) return null;
  if (kind === 'movie') return { kind, tmdbId, title, year, season: null, episode: null };
  return at ? { kind, tmdbId, title, year, ...at } : null;
}

export function fileContainer(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The spans of a film already downloaded, in seconds, from `slices`: parts of
 * its file in file order, each the percent of it on disk, laid linearly over
 * `durationSec`. A slice counts once it is whole, and neighbours merge. */
export function downloadedSpans(
  slices: readonly number[],
  durationSec: number,
): [number, number][] {
  const width = durationSec / Math.max(1, slices.length);
  const spans: [number, number][] = [];
  slices.forEach((percent, slice) => {
    if (percent < 100) return;
    const last = spans.at(-1);
    if (last && last[1] === slice * width) last[1] = (slice + 1) * width;
    else spans.push([slice * width, (slice + 1) * width]);
  });
  return spans;
}
