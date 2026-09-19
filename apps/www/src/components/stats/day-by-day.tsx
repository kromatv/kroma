import { Card } from '#site/components/stats/card';
import { StatsHeading } from '#site/components/stats/heading';
import { Trend } from '#site/components/stats/trend';
import type { Stats } from '#site/lib/stats';
import { m } from '#site/paraglide/messages';

export function DayByDay({ stats }: Readonly<{ stats: Stats }>) {
  const days = stats.history.map((point) => point.day);
  const series = [
    {
      id: 'instances',
      label: m.stats_trend_servers(),
      unit: m.stats_trend_unit(),
      values: stats.history.map((point) => point.instances),
    },
    {
      id: 'clients',
      label: m.stats_trend_devices(),
      unit: m.stats_trend_unit_devices(),
      values: stats.history.map((point) => point.clients),
    },
  ];

  return (
    <section>
      <StatsHeading eyebrow={m.stats_trend_eyebrow()} title={m.stats_trend_title()} />
      <Card className="mt-8">
        <Trend days={days} series={series} empty={m.stats_trend_empty()} />
      </Card>
    </section>
  );
}
