import { IconGitCommit } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { BuildRow } from '#site/components/archive/build-row';
import { MonthHeading } from '#site/components/archive/month-heading';
import { fromCanaryFile } from '#site/lib/build-file';
import { type BuildFilter, NO_FILTER } from '#site/lib/build-select';
import { type CanaryBuild, fetchCanary } from '#site/lib/canary';
import { groupByMonth } from '#site/lib/day';
import { m } from '#site/paraglide/messages';

export interface CanaryRunsProps {
  filter?: BuildFilter;
}

type State = { status: 'loading' } | { status: 'ready'; builds: CanaryBuild[] };

/**
 * The televisions, the phone and the rest of the fleet, taken off the CI run
 * that built them.
 *
 * The one runtime fetch on this site: a run's artifacts need a token GitHub will
 * not give an anonymous caller, so they are resolved by `/api/canary` rather
 * than baked in. Unreachable, it says so, and the builds above it remain the
 * channel's real content.
 */
export function CanaryRuns({ filter = NO_FILTER }: Readonly<CanaryRunsProps>) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    void fetchCanary().then((builds) => {
      if (live) setState({ status: 'ready', builds });
    });
    return () => {
      live = false;
    };
  }, []);

  const wanted = filter.query.trim().toLowerCase();
  const rows =
    state.status === 'ready'
      ? state.builds
          .filter((build) => !wanted || (build.version ?? '').toLowerCase().includes(wanted))
          .map((build) => ({
            build,
            files: build.files
              .filter((file) => !filter.label || file.label === filter.label)
              .map(fromCanaryFile),
          }))
          .filter((row) => row.files.length > 0)
      : [];

  const months = groupByMonth(rows, (row) => row.build.run.finishedAt);

  return (
    <section className="mt-14 border-t border-border/60 pt-10">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <IconGitCommit size={19} stroke={1.75} className="shrink-0 text-accent-text" aria-hidden />
        <h3 className="font-display text-lg font-bold text-text">{m.channel_runs_title()}</h3>
        {rows.length > 0 && (
          <span className="rounded-full border border-border px-2 py-0.5 font-sans text-[0.68rem] font-medium tabular-nums text-dim">
            {rows.length}
          </span>
        )}
      </div>
      <p className="mt-2.5 max-w-2xl text-pretty text-sm leading-relaxed text-muted">
        {m.channel_runs_lead()}
      </p>

      <div className="mt-8">
        {state.status === 'loading' && (
          <p className="text-sm text-dim">{m.channel_runs_loading()}</p>
        )}
        {state.status === 'ready' && state.builds.length === 0 && (
          <p className="text-sm text-dim">{m.channel_runs_unreachable()}</p>
        )}
        {state.status === 'ready' && state.builds.length > 0 && rows.length === 0 && (
          <p className="text-sm text-dim">{m.channel_runs_none_for_platform()}</p>
        )}
        {months.map((month) => (
          <section key={month.key ?? 'undated'}>
            <MonthHeading month={month.key} />
            {month.items.map(({ build, files }) => (
              <BuildRow
                key={build.commit.short}
                version={build.version ?? '—'}
                at={build.run.finishedAt}
                note={build.commit.title}
                tag={
                  <code className="shrink-0 rounded bg-wash px-1.5 py-0.5 font-mono text-xs text-accent-text">
                    {build.commit.short}
                  </code>
                }
                files={files}
                source={{ href: build.run.url, label: m.channel_run_link() }}
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
