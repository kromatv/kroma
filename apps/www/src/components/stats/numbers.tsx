import type { ReactNode } from 'react';
import { Card } from '#site/components/stats/card';
import { StatsHeading } from '#site/components/stats/heading';
import { getLocale } from '#site/lib/i18n';
import type { Stats } from '#site/lib/stats';
import { m } from '#site/paraglide/messages';

const HIDDEN = '—';

interface FigureProps {
  label: string;
  value: string;
  hint: string;
  detail?: ReactNode;
}

function Figure({ label, value, hint, detail }: Readonly<FigureProps>) {
  return (
    <div className="flex flex-col gap-3 p-5 sm:p-6">
      <p className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-dim">{label}</p>
      <p className="font-display text-4xl font-extrabold leading-none text-text tabular-nums">
        {value}
      </p>
      {detail}
      <p className="text-sm leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

export function Numbers({ stats }: Readonly<{ stats: Stats }>) {
  const locale = getLocale();
  const count = (n: number) => n.toLocaleString(locale);
  const sizes = stats.sizes ?? null;
  const kinds = [
    [m.stats_tile_tv(), stats.clients.tv],
    [m.stats_tile_mobile(), stats.clients.mobile],
    [m.stats_tile_desktop(), stats.clients.desktop],
  ] as const;
  // A figure is over the servers that report that block, and saying which is
  // the difference between a number and a misleading one.
  const over = (n: number | undefined) =>
    n !== undefined && n < stats.instances
      ? m.stats_reported_by({ n: count(n), total: count(stats.instances) })
      : undefined;
  const devicesOver = over(stats.reports?.statistics);
  const sizesOver = sizes ? over(stats.reports?.sizes) : undefined;
  const footnotes = [
    devicesOver && m.stats_devices_over({ over: devicesOver }),
    sizesOver && m.stats_sizes_over({ over: sizesOver }),
  ].filter(Boolean);

  return (
    <section>
      <StatsHeading eyebrow={m.stats_numbers_eyebrow()} title={m.stats_numbers_title()} />
      <Card
        padded={false}
        className="mt-8 grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <Figure
          label={m.stats_tile_clients()}
          value={count(stats.clients.total)}
          hint={m.stats_tile_clients_hint()}
          detail={
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {kinds.map(([label, n]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dd className="font-semibold text-text tabular-nums">{count(n)}</dd>
                  <dt className="text-dim">{label}</dt>
                </div>
              ))}
            </dl>
          }
        />
        <Figure
          label={m.stats_tile_titles()}
          value={sizes ? count(sizes.titles) : HIDDEN}
          hint={sizes ? m.stats_tile_titles_hint() : m.stats_sizes_hidden()}
        />
        <Figure
          label={m.stats_tile_users()}
          value={sizes ? count(sizes.users) : HIDDEN}
          hint={sizes ? m.stats_tile_users_hint() : m.stats_sizes_hidden()}
        />
      </Card>
      {footnotes.length > 0 && <p className="mt-3 text-xs text-dim">{footnotes.join(' ')}</p>}
    </section>
  );
}
