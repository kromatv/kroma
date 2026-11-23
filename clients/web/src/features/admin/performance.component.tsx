import type { PerfOverview, PerfWindow } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Callout, SegmentGroup } from '@kromatv/ui/kit';
import { PerfScopeDrawer } from '#web/features/admin/performance-scope-drawer.component';
import { PerfScopeTable } from '#web/features/admin/performance-scope-table.component';
import { PerfSegmentDrawer } from '#web/features/admin/performance-segment-drawer.component';
import { PerfSegmentTable } from '#web/features/admin/performance-segment-table.component';
import { PerfSlowDrawer } from '#web/features/admin/performance-slow-drawer.component';
import { PerfSlowList } from '#web/features/admin/performance-slow.component';
import { offNotice, segmentsOf } from '#web/features/admin/performance-format';
import {
  closed,
  type OpenDrawer,
  openDrawer,
  PERF_TABS,
  type PerfSearch,
  type PerfTab,
  shownIn,
} from '#web/features/admin/performance-tabs';
import { PerfToolbar } from '#web/features/admin/performance-toolbar.component';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import type { ReactNode } from 'react';
import { TableSkeleton } from '#web/shared/ui';

const TAB_LABEL: Readonly<Record<PerfTab, MessageKey>> = {
  requests: 'perf.tabRequests',
  jobs: 'perf.tabJobs',
  statements: 'perf.tabStatements',
  functions: 'perf.tabFunctions',
  slow: 'perf.tabSlow',
};

function isTab(value: string): value is PerfTab {
  const tabs: readonly string[] = PERF_TABS;
  return tabs.includes(value);
}

interface PerformancePageProps {
  search: PerfSearch;
  onSearch: (next: PerfSearch) => void;
}

type MeasuredTab = Exclude<PerfTab, 'slow'>;

const MEASURED: Readonly<Record<MeasuredTab, (overview: PerfOverview) => ReactNode>> = {
  requests: (overview) => <PerfScopeTable rows={overview.requests} labelKey="perf.tabRequests" />,
  jobs: (overview) => <PerfScopeTable rows={overview.jobs} labelKey="perf.tabJobs" />,
  statements: (overview) => (
    <PerfSegmentTable
      rows={segmentsOf(overview.segments, 'statements')}
      labelKey="perf.tabStatements"
    />
  ),
  functions: (overview) => (
    <PerfSegmentTable
      rows={segmentsOf(overview.segments, 'functions')}
      labelKey="perf.tabFunctions"
    />
  ),
};

interface DrawerProps {
  open: OpenDrawer;
  onClose: () => void;
}

function SlowDrawer({ open, onClose }: Readonly<DrawerProps>) {
  return open.slow ? <PerfSlowDrawer id={open.slow} onClose={onClose} /> : null;
}

function ScopeDrawer({ open, onClose }: Readonly<DrawerProps>) {
  if (open.scope) {
    return <PerfScopeDrawer row={open.scope} onClose={onClose} />;
  }
  return <SlowDrawer open={open} onClose={onClose} />;
}

function Drawers({
  search,
  overview,
  onSearch,
}: Readonly<PerformancePageProps & { overview: PerfOverview | null }>) {
  const close = () => onSearch(closed(search));
  const open = openDrawer(search, overview);
  if (open.segment) {
    return <PerfSegmentDrawer row={open.segment} onClose={close} />;
  }
  return <ScopeDrawer open={open} onClose={close} />;
}

function Measured({
  tab,
  overview,
}: Readonly<{ tab: MeasuredTab; overview: PerfOverview | null }>) {
  return overview ? MEASURED[tab](overview) : <TableSkeleton rows={10} />;
}

function Body({
  tab,
  window,
  overview,
}: Readonly<{ tab: PerfTab; window: PerfWindow; overview: PerfOverview | null }>) {
  if (tab === 'slow') {
    return <PerfSlowList window={window} />;
  }
  return <Measured tab={tab} overview={overview} />;
}

function OffNotice({ overview }: Readonly<{ overview: PerfOverview | null }>) {
  const t = useT();
  const notice = offNotice(overview);
  if (!notice) {
    return null;
  }
  return (
    <Box mb={16}>
      <Callout.Root tone="accent">
        <Callout.Title>{t(notice)}</Callout.Title>
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
 *  statement and function, with the slow requests. */
export function PerformancePage({ search, onSearch }: Readonly<PerformancePageProps>) {
  const t = useT();
  const { client } = useAuth();
  const { tab, window } = shownIn(search);
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
