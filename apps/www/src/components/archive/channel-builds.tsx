import { BuildRow } from '#site/components/archive/build-row';
import { MonthHeading } from '#site/components/archive/month-heading';
import { fromDownload } from '#site/lib/build-file';
import { type BuildFilter, NO_FILTER, selectBuilds } from '#site/lib/build-select';
import type { ChannelBuild } from '#site/lib/channels';
import { groupByMonth } from '#site/lib/day';
import { m } from '#site/paraglide/messages';

export interface ChannelBuildsProps {
  builds: readonly ChannelBuild[];
  filter?: BuildFilter;
}

/** A rolling channel's builds: one row per push to main. */
export function ChannelBuilds({ builds, filter = NO_FILTER }: Readonly<ChannelBuildsProps>) {
  const rows = selectBuilds(
    builds,
    (b) => ({ version: b.version, downloads: b.downloads }),
    filter,
  );
  if (rows.length === 0) return <p className="text-sm text-muted">{m.archive_no_match()}</p>;

  const months = groupByMonth(rows, (row) => row.item.builtAt);
  const newest = rows[0]?.item.builtAt;

  return (
    <div>
      {months.map((month) => (
        <section key={month.key ?? 'undated'}>
          <MonthHeading month={month.key} />
          {month.items.map(({ item: build, downloads }) => (
            <BuildRow
              key={build.version ?? build.builtAt}
              version={build.version ?? '—'}
              at={build.builtAt}
              files={downloads.map(fromDownload)}
              featured={build.builtAt === newest}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
