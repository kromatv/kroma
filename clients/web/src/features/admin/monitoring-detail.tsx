import type { EpisodeMonitoringBody, MonitorBody } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, EmptyState, Surface } from '@kromatv/ui/kit';
import { MonitoringCard } from '#web/features/admin/monitoring-card';
import { TitleIdentityCard } from '#web/features/admin/monitoring-identity';
import { SeasonList } from '#web/features/admin/monitoring-seasons';
import { DetailSkeleton } from '#web/features/admin/request-cards';
import { Denied, PageHeader, useAsyncAction, useCap } from '#web/features/admin/shell';
import { ConsoleToast, useConsoleToast } from '#web/features/admin/table-console';
import {
  useMonitoredTitles,
  useMonitoringRefresh,
  useTitleLedger,
} from '#web/features/admin/use-monitoring';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

export function MonitoringDetailPage({
  kind,
  tmdbId,
}: Readonly<{ kind: RequestKind; tmdbId: number }>) {
  if (!useCap('library.manage')) return <Denied />;
  return <MonitoringDetail kind={kind} tmdbId={tmdbId} />;
}

function MonitoringDetail({ kind, tmdbId }: Readonly<{ kind: RequestKind; tmdbId: number }>) {
  const t = useT();
  const { client } = useAuth();
  const { toast, flash } = useConsoleToast();
  const { busy, run } = useAsyncAction();
  const refresh = useMonitoringRefresh();

  const { data: titles, loading: listLoading } = useMonitoredTitles();
  const ledger = useTitleLedger(kind, tmdbId);
  const monitored = titles?.find((row) => row.kind === kind && row.tmdbId === tmdbId) ?? null;
  const title = monitored?.title ?? ledger.data?.title ?? '';

  const act = (done: string, call: () => Promise<unknown>) => {
    void run(() =>
      call().then(
        async () => {
          flash(`« ${title} » ${done}`);
          await refresh();
        },
        () => flash(t('monitoring.actionFailed')),
      ),
    );
  };

  const monitor = (body: MonitorBody) => {
    if (body.searchNow) {
      act(t('monitoring.toastSearching'), () => client.monitoring.monitor(kind, tmdbId, body));
      return;
    }
    const done = monitored ? t('monitoring.toastUpdated') : t('monitoring.toastFollowed');
    act(done, () => client.monitoring.monitor(kind, tmdbId, body));
  };
  const unmonitor = () =>
    act(t('monitoring.toastUnfollowed'), () => client.monitoring.unmonitor(kind, tmdbId));
  const setEpisodes = (body: EpisodeMonitoringBody) =>
    act(t('monitoring.toastUpdated'), () => client.monitoring.setEpisodes(tmdbId, body));

  if (ledger.isPending || listLoading) return <DetailSkeleton />;

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Back label={t('monitoring.title')} asChild>
          <RouteLink to="/admin/monitoring" />
        </PageHeader.Back>
        <PageHeader.Title>{title}</PageHeader.Title>
        <PageHeader.Subtitle>{t('monitoring.subtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>

      {ledger.isError ? (
        <Box mb={16}>
          <Callout.Root tone="danger">
            <Callout.Title>{t('monitoring.ledgerFailed')}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}

      <Box row={{ base: false, lg: true }} gap={16} align="flex-start">
        <Box w={{ base: '100%', lg: 320 }} shrink={0} gap={16}>
          {ledger.data ? <TitleIdentityCard ledger={ledger.data} /> : null}
        </Box>
        <Box flex minW={0} w={{ base: '100%', lg: 'auto' }} gap={16}>
          <MonitoringCard
            kind={kind}
            title={title}
            monitored={monitored}
            busy={busy}
            onMonitor={monitor}
            onUnmonitor={unmonitor}
          />

          {kind === 'show' && ledger.data ? (
            <SeasonList
              tmdbId={tmdbId}
              seasons={ledger.data.seasons}
              today={ledger.data.today}
              busy={busy}
              onEpisodes={setEpisodes}
            />
          ) : null}

          <ModuleSlot
            name="monitoring.detail"
            kind={kind}
            tmdbId={tmdbId}
            title={title}
            monitored={monitored !== null}
            fallback={<NoAcquisition />}
          />
        </Box>
      </Box>

      <ConsoleToast toast={toast} />
    </>
  );
}

function NoAcquisition() {
  const t = useT();
  return (
    <Surface elevated radius="xl" pad="none" px={28}>
      <EmptyState.Root layout="fill" icon="adjustments">
        <EmptyState.Title>{t('monitoring.acquisitionUnavailable')}</EmptyState.Title>
        <EmptyState.Hint>{t('monitoring.acquisitionUnavailableHint')}</EmptyState.Hint>
        <EmptyState.Actions>
          <Button variant="glass" size="sm" icon="apps" label={t('admin.navModules')} asChild>
            <RouteLink to="/admin/modules" />
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </Surface>
  );
}
