import type { TorrentFileView } from '@kroma/module-acquisition/schemas';

/** Selectable rows. Omit the whole thing for a read-only view. */
export interface ContentsSelection {
  selected: ReadonlySet<number>;
  onSelectedChange: (next: Set<number>) => void;
}

export type ContentsGroupKind = 'season' | 'film' | 'extras';

export interface ContentsGroup {
  key: string;
  kind: ContentsGroupKind;
  season: number | null;
  files: TorrentFileView[];
}

export const bytesOf = (files: readonly TorrentFileView[]) =>
  files.reduce((sum, file) => sum + file.sizeBytes, 0);

/**
 * Episodes by season, then the video with no episode (a film), then everything
 * that is not video at all. Sorted, because a torrent's own order is arbitrary.
 */
export function groupContents(files: readonly TorrentFileView[]): ContentsGroup[] {
  const bySeason = new Map<number, TorrentFileView[]>();
  const loose: TorrentFileView[] = [];
  const extras: TorrentFileView[] = [];
  for (const file of files) {
    if (!file.isVideo) {
      extras.push(file);
      continue;
    }
    if (file.episode === null) {
      loose.push(file);
      continue;
    }
    const season = file.season ?? 0;
    const at = bySeason.get(season) ?? [];
    at.push(file);
    bySeason.set(season, at);
  }

  const out: ContentsGroup[] = [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, seasonFiles]) => ({
      key: `s${season}`,
      kind: 'season' as const,
      season,
      files: [...seasonFiles].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0)),
    }));
  if (loose.length > 0) out.push({ key: 'film', kind: 'film', season: null, files: loose });
  if (extras.length > 0) out.push({ key: 'extras', kind: 'extras', season: null, files: extras });
  return out;
}

/** A heading unless the whole torrent is one file, and a grand total only once
 *  two groups of VIDEO have to be added up: an `.nfo` beside a season totals to
 *  the season's own figure. */
export function contentsLayout(groups: readonly ContentsGroup[]): {
  showHeadings: boolean;
  showTotal: boolean;
} {
  const only = groups.length === 1 ? groups[0] : undefined;
  return {
    showHeadings: only?.files.length !== 1,
    showTotal: groups.filter((group) => group.kind !== 'extras').length > 1,
  };
}

export function withFilesSelected(
  selected: ReadonlySet<number>,
  files: readonly TorrentFileView[],
  { include }: { include: boolean },
): Set<number> {
  const next = new Set(selected);
  for (const file of files) {
    if (include) next.add(file.index);
    else next.delete(file.index);
  }
  return next;
}
