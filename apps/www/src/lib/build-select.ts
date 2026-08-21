import { onlyLabel, type SiteDownload } from '#site/lib/releases';

export interface BuildFilter {
  /** Keeps only files installing on this platform. Null keeps every platform. */
  label: string | null;
  /** Keeps only builds whose version contains this. Empty keeps every build. */
  query: string;
}

export const NO_FILTER: BuildFilter = { label: null, query: '' };

/**
 * The builds a filter leaves, each with only the files it left.
 *
 * One selector for the lists and for the counts above them, so a channel can
 * never claim a number its own list does not show. A build whose every file the
 * platform filter removed is not a build on offer, so it drops out entirely.
 */
export function selectBuilds<T>(
  items: readonly T[],
  read: (item: T) => { version: string | null; downloads: readonly SiteDownload[] },
  { label, query }: BuildFilter,
): { item: T; downloads: SiteDownload[] }[] {
  const wanted = query.trim().toLowerCase();

  return items.flatMap((item) => {
    const { version, downloads } = read(item);
    if (wanted && !(version ?? '').toLowerCase().includes(wanted)) return [];

    const kept = onlyLabel(downloads, label);
    return kept.length > 0 ? [{ item, downloads: kept }] : [];
  });
}
