import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { PageShell } from '#site/components/contact/page-shell';
import { BarList } from '#site/components/stats/bar-list';
import { StatTile } from '#site/components/stats/stat-tile';
import { Trend } from '#site/components/stats/trend';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { fetchStats, type Stats } from '#site/lib/stats';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/stats')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.stats_head_title(),
      description: m.stats_head_description(),
      path: '/stats',
    }),
  component: StatsPage,
});

type State = { kind: 'loading' } | { kind: 'ready'; stats: Stats } | { kind: 'failed' };

// The page is prerendered, so the numbers are fetched in the browser: the build
// would otherwise bake a snapshot that is wrong by the time anyone reads it.
function useStats(): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    fetchStats(abort.signal)
      .then((stats) => setState({ kind: 'ready', stats }))
      .catch(() => {
        if (!abort.signal.aborted) setState({ kind: 'failed' });
      });
    return () => abort.abort();
  }, []);
  return state;
}

function Note({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-6">
      <h2 className="font-display text-lg font-bold text-text">{title}</h2>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">{body}</p>
    </section>
  );
}

function Numbers({ stats }: Readonly<{ stats: Stats }>) {
  const locale = getLocale();
  const count = (n: number) => n.toLocaleString(locale);
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const languages = new Intl.DisplayNames([locale], { type: 'language' });
  const other = m.stats_other();
  const empty = m.stats_empty();

  return (
    <>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <StatTile
          label={m.stats_tile_instances()}
          value={count(stats.instances)}
          hint={m.stats_tile_instances_hint()}
        />
        <StatTile
          label={m.stats_tile_clients()}
          value={count(stats.clients.total)}
          hint={m.stats_tile_clients_hint()}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile label={m.stats_tile_tv()} value={count(stats.clients.tv)} />
        <StatTile label={m.stats_tile_mobile()} value={count(stats.clients.mobile)} />
        <StatTile label={m.stats_tile_desktop()} value={count(stats.clients.desktop)} />
      </div>

      <div className="mt-4">
        <Trend
          title={m.stats_trend_title()}
          points={stats.history}
          empty={m.stats_trend_empty()}
          unit={m.stats_trend_unit()}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarList
          title={m.stats_versions_title()}
          counts={stats.versions}
          empty={empty}
          otherLabel={other}
        />
        <BarList
          title={m.stats_platforms_title()}
          counts={stats.platforms}
          empty={empty}
          otherLabel={other}
        />
        <BarList
          title={m.stats_installs_title()}
          counts={stats.installs}
          empty={empty}
          otherLabel={other}
        />
        <BarList
          title={m.stats_countries_title()}
          counts={stats.countries}
          empty={empty}
          otherLabel={other}
          format={(code) => regions.of(code) ?? code}
        />
        <BarList
          title={m.stats_locales_title()}
          counts={stats.locales}
          empty={empty}
          otherLabel={other}
          format={(tag) => languages.of(tag) ?? tag}
        />
        <BarList
          title={m.stats_modules_title()}
          counts={stats.modules}
          empty={empty}
          otherLabel={other}
        />
      </div>

      <p className="mt-6 text-sm text-dim">
        {m.stats_updated({ when: new Date(stats.updatedAt * 1000).toLocaleString(locale) })}
      </p>
    </>
  );
}

function StatsPage() {
  const state = useStats();
  return (
    <PageShell eyebrow={m.stats_eyebrow()} title={m.stats_title()} intro={m.stats_intro()}>
      {state.kind === 'loading' && <p className="mt-12 text-sm text-muted">{m.stats_loading()}</p>}
      {state.kind === 'failed' && <p className="mt-12 text-sm text-muted">{m.stats_failed()}</p>}
      {state.kind === 'ready' && <Numbers stats={state.stats} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Note title={m.stats_method_title()} body={m.stats_method_body()} />
        <Note title={m.stats_optin_title()} body={m.stats_optin_body()} />
      </div>
    </PageShell>
  );
}
