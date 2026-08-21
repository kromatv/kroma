import { BuildRow } from '#site/components/archive/build-row';
import { MonthHeading } from '#site/components/archive/month-heading';
import { fromDownload } from '#site/lib/build-file';
import { type BuildFilter, NO_FILTER, selectBuilds } from '#site/lib/build-select';
import { groupByMonth } from '#site/lib/day';
import type { SiteRelease } from '#site/lib/releases';
import { m } from '#site/paraglide/messages';

export interface ReleaseBuildsProps {
  releases: readonly SiteRelease[];
  filter?: BuildFilter;
}

/** The stable channel: every published version under the month it shipped in. */
export function ReleaseBuilds({ releases, filter = NO_FILTER }: Readonly<ReleaseBuildsProps>) {
  const rows = selectBuilds(
    releases,
    (r) => ({ version: r.version, downloads: r.downloads }),
    filter,
  );
  if (rows.length === 0) return <p className="text-sm text-muted">{m.archive_no_match()}</p>;

  const months = groupByMonth(rows, (row) => row.item.publishedAt);
  const newest = rows[0]?.item.tag;

  return (
    <div>
      {months.map((month) => (
        <section key={month.key ?? 'undated'}>
          <MonthHeading month={month.key} />
          {month.items.map(({ item: release, downloads }) => (
            <BuildRow
              key={release.tag}
              version={release.version}
              at={release.publishedAt}
              files={downloads.map(fromDownload)}
              source={{ href: release.notesUrl, label: m.download_release_notes() }}
              featured={release.tag === newest}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
