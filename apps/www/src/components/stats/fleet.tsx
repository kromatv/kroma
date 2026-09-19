import { catalog } from 'virtual:kroma-modules';
import { BarList } from '#site/components/stats/bar-list';
import { Card } from '#site/components/stats/card';
import { StatsHeading } from '#site/components/stats/heading';
import { displayName } from '#site/lib/display-name';
import { flagUrl } from '#site/lib/flags';
import { getLocale } from '#site/lib/i18n';
import type { Stats } from '#site/lib/stats';
import { targetName } from '#site/lib/target-name';
import { m } from '#site/paraglide/messages';

const modules = new Map(catalog.modules.map((mod) => [mod.id, mod]));

export function Fleet({ stats }: Readonly<{ stats: Stats }>) {
  const locale = getLocale();
  const count = (n: number) => n.toLocaleString(locale);
  const regions = displayName('region', locale);
  const languages = displayName('language', locale);
  const empty = m.stats_empty();
  const other = m.stats_other();
  const usage = stats.reports?.usage;
  const over = (n: number | undefined) =>
    n !== undefined && n < stats.instances
      ? m.stats_reported_by({ n: count(n), total: count(stats.instances) })
      : undefined;

  return (
    <section>
      <StatsHeading
        eyebrow={m.stats_fleet_eyebrow()}
        title={m.stats_fleet_title()}
        intro={m.stats_fleet_intro()}
      />
      <Card className="mt-8 grid gap-8 md:grid-cols-3">
        <BarList
          title={m.stats_versions_title()}
          counts={stats.versions}
          total={stats.instances}
          empty={empty}
          otherLabel={other}
        />
        <BarList
          title={m.stats_platforms_title()}
          counts={stats.platforms}
          total={stats.instances}
          empty={empty}
          otherLabel={other}
          format={targetName}
        />
        <BarList
          title={m.stats_installs_title()}
          counts={stats.installs}
          total={stats.instances}
          empty={empty}
          otherLabel={other}
        />
      </Card>
      <div className="mt-4 grid items-start gap-4 md:grid-cols-3">
        <Card>
          <BarList
            title={m.stats_countries_title()}
            counts={stats.countries}
            total={stats.instances}
            empty={m.stats_countries_none()}
            otherLabel={other}
            format={regions}
            icon={flagUrl}
            iconShape="flag"
          />
        </Card>
        <Card>
          <BarList
            title={m.stats_locales_title()}
            counts={stats.locales}
            total={usage}
            empty={empty}
            otherLabel={other}
            format={languages}
            footnote={over(usage)}
          />
        </Card>
        <Card>
          <BarList
            title={m.stats_modules_title()}
            counts={stats.modules}
            total={usage}
            empty={empty}
            otherLabel={other}
            format={(id) => modules.get(id)?.name ?? id}
            icon={(id) => modules.get(id)?.icon}
            footnote={over(usage)}
          />
        </Card>
      </div>
    </section>
  );
}
