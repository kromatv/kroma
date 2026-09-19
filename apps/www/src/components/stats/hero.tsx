import { Container } from '#site/components/container';
import type { GlobePin } from '#site/components/stats/globe/model';
import { GlobeView } from '#site/components/stats/globe-view';
import type { StatsState } from '#site/components/stats/use-stats';
import { centroidOf } from '#site/lib/country-centroids';
import { displayName } from '#site/lib/display-name';
import { flagUrl } from '#site/lib/flags';
import { getLocale } from '#site/lib/i18n';
import { relativeTime } from '#site/lib/relative-time';
import type { Stats } from '#site/lib/stats';
import { useGround } from '#site/lib/use-ground';
import { m } from '#site/paraglide/messages';

function toPins(countries: Stats['countries'], name: (code: string) => string): GlobePin[] {
  return countries.flatMap(({ key, n }) => {
    const centroid = centroidOf(key);
    if (!centroid) return [];
    return [
      { code: key, label: name(key), flag: flagUrl(key), n, lat: centroid[0], lng: centroid[1] },
    ];
  });
}

export function StatsHero({ state }: Readonly<{ state: StatsState }>) {
  const locale = getLocale();
  const ground = useGround();
  const stats = state.kind === 'ready' ? state.stats : null;
  const pins = toPins(stats?.countries ?? [], displayName('region', locale));

  return (
    <section className="relative overflow-hidden">
      <div className="glow-amber pointer-events-none absolute inset-x-0 -top-16 h-[560px]" />
      <Container>
        <div className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,33rem)] lg:gap-16">
          <div className="max-w-xl">
            <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
              {m.stats_eyebrow()}
            </p>
            <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] text-text sm:text-5xl">
              {m.stats_title()}
            </h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{m.stats_intro()}</p>
            <Headline state={state} locale={locale} />
          </div>
          <div className="relative mx-auto w-full max-w-[33rem]">
            <div className="glow-amber pointer-events-none absolute -inset-[12%]" aria-hidden />
            <div className="relative">
              <GlobeView pins={pins} ground={ground} label={m.stats_globe_label()} />
            </div>
            <p className="mt-3 text-center text-xs text-dim">{m.stats_globe_caption()}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Headline({ state, locale }: Readonly<{ state: StatsState; locale: string }>) {
  return (
    <div className="mt-10">
      <p className="flex items-center gap-2.5 font-sans text-xs font-bold uppercase tracking-[0.18em] text-dim">
        <span className="inline-block size-2 rounded-full bg-accent-wash" aria-hidden />
        {m.stats_tile_instances()}
      </p>
      {state.kind === 'loading' && (
        <output
          aria-label={m.stats_loading()}
          className="mt-3 block h-16 w-40 rounded-2xl bg-wash motion-safe:animate-pulse sm:h-20"
        />
      )}
      {state.kind === 'failed' && (
        <p className="mt-3 max-w-md text-sm text-muted">{m.stats_failed()}</p>
      )}
      {state.kind === 'ready' && (
        <Count stats={state.stats} fetchedAt={state.fetchedAt} locale={locale} />
      )}
    </div>
  );
}

interface CountProps {
  stats: Stats;
  fetchedAt: number;
  locale: string;
}

function Count({ stats, fetchedAt, locale }: Readonly<CountProps>) {
  const count = (n: number) => n.toLocaleString(locale);
  const one = (n: number) => new Intl.PluralRules(locale).select(n) === 'one';
  const countries = stats.located?.countries;
  const devices = stats.clients.total;
  const parts = [
    countries !== undefined &&
      (one(countries)
        ? m.stats_hero_countries_one({ n: count(countries) })
        : m.stats_hero_countries_other({ n: count(countries) })),
    one(devices)
      ? m.stats_hero_devices_one({ n: count(devices) })
      : m.stats_hero_devices_other({ n: count(devices) }),
  ].filter(Boolean);

  return (
    <>
      <p className="mt-2 font-display text-7xl font-extrabold leading-none text-text tabular-nums sm:text-8xl">
        {count(stats.instances)}
      </p>
      <p className="mt-4 text-base text-muted">{parts.join(' · ')}</p>
      <p className="mt-3 text-sm text-dim">{m.stats_tile_instances_hint()}</p>
      <p
        className="mt-1 text-sm text-dim"
        title={new Date(stats.updatedAt * 1000).toLocaleString(locale)}
      >
        {m.stats_updated({ when: relativeTime(stats.updatedAt, fetchedAt, locale) })}
      </p>
    </>
  );
}
