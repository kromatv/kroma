import type { Highlight, Release, ReleasesView } from '@kromatv/client/releases';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

type CountKey = 'releases.highlightCount' | 'releases.fixCount';

interface ReleaseCount {
  key: CountKey;
  count: number;
}

export interface WhatsNew {
  release: Release;
  steps: [Highlight, ...Highlight[]];
}

/** A release's `YYYY-MM-DD` as the reader's locale writes it, or null when it
 *  has none or it does not parse. */
export function formatReleaseDate(
  iso: string | undefined,
  locale: string,
  style: 'long' | 'medium',
): string | null {
  const day = iso ? ISO_DAY.exec(iso) : null;
  if (!day) return null;
  const at = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(at);
}

/** What a release's heading counts, highlights first, leaving out a zero. */
export function releaseCounts(release: Release): ReleaseCount[] {
  const counts: ReleaseCount[] = [
    { key: 'releases.highlightCount', count: release.highlights.length },
    { key: 'releases.fixCount', count: release.fixed.length },
  ];
  return counts.filter(({ count }) => count > 0);
}

/** The unseen release and its highlights. Null once it was seen,
 *  and for a release without a highlight. */
export function whatsNewSteps(view: ReleasesView): WhatsNew | null {
  const release = view.releases.find(({ version }) => version === view.unseen);
  const [first, ...rest] = release?.highlights ?? [];
  if (!release || !first) return null;
  return { release, steps: [first, ...rest] };
}

/** The first highlight spans the column when it has a picture; the rest fill
 *  rows of `columns`. */
export function highlightLayout(
  highlights: readonly Highlight[],
  columns: 1 | 2,
): { lead: Highlight | null; rows: Highlight[][] } {
  const [first, ...others] = highlights;
  const lead = first?.image ? first : null;
  const rest = lead ? others : highlights;
  const rows: Highlight[][] = [];
  for (let at = 0; at < rest.length; at += columns) rows.push(rest.slice(at, at + columns));
  return { lead, rows };
}
