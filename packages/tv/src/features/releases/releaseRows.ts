import type { Highlight, Release } from '@kromatv/client/releases';
import type { Translate } from '@kromatv/i18n';

export type ReleaseRow =
  | { kind: 'highlight'; highlight: Highlight }
  | { kind: 'fixed'; lines: readonly string[] }
  | { kind: 'owner'; lines: readonly string[] };

export function releaseRows(release: Release): ReleaseRow[] {
  const rows = release.highlights.map(
    (highlight): ReleaseRow => ({ kind: 'highlight', highlight }),
  );
  if (release.fixed.length > 0) rows.push({ kind: 'fixed', lines: release.fixed });
  if (release.owner.length > 0) rows.push({ kind: 'owner', lines: release.owner });
  return rows;
}

export function rowLabel(row: ReleaseRow, t: Translate): string {
  if (row.kind === 'highlight') return row.highlight.title;
  return t(row.kind === 'fixed' ? 'releases.fixed' : 'releases.owner');
}
