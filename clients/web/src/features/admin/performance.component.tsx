import type { PerfOverview, PerfScopeRow, PerfWindow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Callout, SegmentGroup } from '@kromatv/ui/kit';
import { PerfLive } from '#web/features/admin/performance-live.component';
import { PerfScopeDrawer } from '#web/features/admin/performance-scope-drawer.component';
import { PerfScopeTable } from '#web/features/admin/performance-scope-table.component';
import { PerfSegmentDrawer } from '#web/features/admin/performance-segment-drawer.component';
import { PerfSegmentTable } from '#web/features/admin/performance-segment-table.component';
import { PerfSlowDrawer } from '#web/features/admin/performance-slow-drawer.component';
import { PerfSlowList } from '#web/features/admin/performance-slow.component';
import { scopeId, segmentsOf } from '#web/features/admin/performance-format';
import { PERF_TABS, type PerfSearch, type PerfTab } from '#web/features/admin/performance-tabs';
import { PerfToolbar } from '#web/features/admin/performance-toolbar.component';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const TAB_LABEL: Readonly<Record<PerfTab, MessageKey>> = {
  requests: 'perf.tabRequests',
  jobs: 'perf.tabJobs',
  statements: 'perf.tabStatements',
  functions: 'perf.tabFunctions',
  slow: 'perf.tabSlow',
  live: 'perf.tabLive',
};

function isTab(value: string): value is PerfTab {
  return PERF_TABS.some((one) => one === value);
}

interface PerformancePageProps {
  search: PerfSearch;
  onSearch: (next: PerfSearch) => void;
}

function Measured({ tab, overview }: Readonly<{ tab: PerfTab; overview: PerfOverview }>) {
  if (tab === 'requests') {
    return <PerfScopeTable rows={overview.requests} labelKey="perf.tabRequests" />;
  }
  if (tab === 'jobs') {
    return <PerfScopeTable rows={overview.jobs} labelKey="perf.tabJobs" />;
  }
  if (tab === 'statements' || tab === 'functions') {
    return <PerfSegmentTable rows={segmentsOf(overview.segments, tab)} labelKey={TAB_LABEL[tab]} />;
  }
  return null;
}

function scopeOf(overview: PerfOverview | null, id: string | undefined): PerfScopeRow | undefined {
  const rows = overview ? [...overview.requests, ...overview.jobs] : [];
  return rows.find((row) => scopeId(row) === id);
}

function Drawers({
  search,
  overview,
  onSearch,
}: Readonly<PerformancePageProps & { overview: PerfOverview | null }>) {
  const close = () =>
    onSearch({ ...search, scope: undefined, segment: undefined, slow: undefined });
  const scope = scopeOf(overview, search.scope);
  const segment = overview?.segments.find((row) => row.key === search.segment);
  if (scope) {
    return <PerfScopeDrawer row={scope} onClose={close} />;
  }
  if (segment) {
    return <PerfSegmentDrawer row={segment} onClose={close} />;
  }
  return search.slow ? <PerfSlowDrawer id={search.slow} onClose={close} /> : null;
}

function Body({
  tab,
  window,
  overview,
}: Readonly<{ tab: PerfTab; window: PerfWindow; overview: PerfOverview | null }>) {
  if (tab === 'slow') {
    return <PerfSlowList window={window} />;
  }
  if (tab === 'live') {
    return <PerfLive />;
  }
  return overview ? <Measured tab={tab} overview={overview} /> : <TableSkeleton rows={10} />;
}

function OffNotice({ overview }: Readonly<{ overview: PerfOverview | null }>) {
  const t = useT();
  if (!overview || overview.enabled) {
    return null;
  }
  return (
    <Box mb={16}>
      <Callout.Root tone="accent">
        <Callout.Title>{t(overview.switchable ? 'perf.off' : 'perf.offByEnv')}</Callout.Title>
      </Callout.Root>
    </Box>
  );
}

function Tabs({ tab, onTab }: Readonly<{ tab: PerfTab; onTab: (next: PerfTab) => void }>) {
  const t = useT();
  return (
    <Box mb={20} align="flex-start">
      <SegmentGroup.Root
        value={tab}
        onValueChange={(next) => isTab(next) && onTab(next)}
        label={t('perf.title')}
      >
        {PERF_TABS.map((one) => (
          <SegmentGroup.Item key={one} value={one}>
            <SegmentGroup.Label>{t(TAB_LABEL[one])}</SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
    </Box>
  );
}

/** Admin → Performance: where the server spends its time, per route, job,
 *  statement and function, with the slow requests and what runs now. */
export function PerformancePage({ search, onSearch }: Readonly<PerformancePageProps>) {
  const t = useT();
  const { client } = useAuth();
  const tab = search.tab ?? 'requests';
  const window = search.window ?? '1h';
  const { data: overview, reload } = usePoll(
    ['admin', 'performance', window],
    () => client.performance.overview(window),
    10000,
  );
  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('perf.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('perf.sub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <PerfToolbar
        overview={overview}
        window={window}
        onWindow={(next) => onSearch({ ...search, window: next })}
        onSwitched={() => void reload()}
      />
      <OffNotice overview={overview} />
      <Tabs tab={tab} onTab={(next) => onSearch({ ...search, tab: next })} />
      <Body tab={tab} window={window} overview={overview} />
      <Drawers search={search} overview={overview} onSearch={onSearch} />
    </>
  );
}
