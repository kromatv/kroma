import type { MonitorBody, SearchNow } from '@kromatv/client/monitoring';
import type { RequestKind, RequestLedgerView } from '@kromatv/client/requests';
import { episodeTag } from '@kromatv/core';
import type { MessageKey, Translate } from '@kromatv/i18n';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, EmptyState, Section, Surface } from '@kromatv/ui/kit';
import { MonitoringDetailSkeleton } from '#web/features/admin/monitoring-detail-skeleton';
import { MonitoringHero } from '#web/features/admin/monitoring-hero';
import { filesOnDisk } from '#web/features/admin/monitoring-model';
import { MonitoringNotice, useMonitoringNotice } from '#web/features/admin/monitoring-notice';
import { SeasonList, useSeasonName } from '#web/features/admin/monitoring-seasons';
import { MonitoringSettings } from '#web/features/admin/monitoring-settings';
import { MonitoringStats } from '#web/features/admin/monitoring-stats';
import { Denied, PageHeader, useAsyncAction, useCap } from '#web/features/admin/shell';
import {
  type EpisodeUnit,
  useEpisodeMonitoring,
  useMonitoredTitles,
  useMonitoringRefresh,
  useTitleLedger,
} from '#web/features/admin/use-monitoring';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

const SECTION_GAP = 28;

const REFUSED: Record<string, MessageKey> = {
  busy: 'monitoring.searchBusy',
  noIndexer: 'monitoring.searchNoIndexer',
  vpnClosed: 'monitoring.searchVpnClosed',
  noModule: 'monitoring.searchNoModule',
};

function searchSaid(t: Translate, search: SearchNow | null): string {
  if (!search) return t('monitoring.searchStarted');
  if (!search.started) return t(REFUSED[search.reason ?? ''] ?? 'monitoring.searchRefused');
  if (search.units > 0) return t('monitoring.searchStartedCount', { count: search.units });
  return t('monitoring.searchStarted');
}

function onDiskOf(kind: RequestKind, ledger: RequestLedgerView | undefined): number {
  if (!ledger) return 0;
  return kind === 'show' ? filesOnDisk(ledger.seasons) : Number(ledger.onDisk);
}

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
  const { notice, on, say } = useMonitoringNotice();
  const { busy, run } = useAsyncAction();
  const refresh = useMonitoringRefresh();
  const seasonName = useSeasonName();

  const { data: titles, loading: listLoading } = useMonitoredTitles();
  const ledger = useTitleLedger(kind, tmdbId);
  const monitored = titles?.find((row) => row.kind === kind && row.tmdbId === tmdbId) ?? null;
  const title = monitored?.title ?? ledger.data?.title ?? '';

  const unitSaid = (unit: EpisodeUnit, following: boolean) => {
    if (unit.episode === undefined) {
      const key = following ? 'monitoring.toastSeasonOn' : 'monitoring.toastSeasonOff';
      return t(key, { name: seasonName(unit.season) });
    }
    const key = following ? 'monitoring.toastEpisodeOn' : 'monitoring.toastEpisodeOff';
    return t(key, { tag: episodeTag({ season: unit.season, episode: unit.episode }) });
  };

  const episodes = useEpisodeMonitoring({
    tmdbId,
    onSaved: (unit, following, undo) => say(unitSaid(unit, following), undo),
    onFailed: () => say(t('monitoring.actionFailed')),
  });

  const act = (done: string, call: () => Promise<unknown>) => {
    void run(() =>
      call().then(
        async () => {
          say(`« ${title} » ${done}`);
          await refresh();
        },
        () => say(t('monitoring.actionFailed')),
      ),
    );
  };

  const search = () => {
    void run(() =>
      client.monitoring.monitor(kind, tmdbId, { searchNow: true }).then(
        async (result) => {
          say(searchSaid(t, result.search ?? null));
          await refresh();
        },
        () => say(t('monitoring.actionFailed')),
      ),
    );
  };

  const monitor = (body: MonitorBody) => {
    const done = monitored ? t('monitoring.toastUpdated') : t('monitoring.toastFollowed');
    act(done, () => client.monitoring.monitor(kind, tmdbId, body));
  };
  const unmonitor = () =>
    act(t('monitoring.toastUnfollowed'), () => client.monitoring.unmonitor(kind, tmdbId));

  if (ledger.isPending || listLoading) return <MonitoringDetailSkeleton />;

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Back label={t('monitoring.title')} asChild>
          <RouteLink to="/admin/monitoring" />
        </PageHeader.Back>
      </PageHeader.Root>

      {ledger.isError ? (
        <Box mb={16}>
          <Callout.Root tone="danger">
            <Callout.Title>{t('monitoring.ledgerFailed')}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}

      <Box gap={SECTION_GAP} mt={24}>
        {ledger.data ? (
          <MonitoringHero
            ledger={ledger.data}
            monitored={monitored}
            busy={busy}
            onFollow={() => monitor({})}
            onSearch={search}
            onUnfollow={unmonitor}
          />
        ) : null}

        {monitored ? (
          <MonitoringStats kind={kind} monitored={monitored} onDisk={onDiskOf(kind, ledger.data)} />
        ) : null}

        <Section.Root>
          <Section.Header>
            <Section.Title>{t('monitoring.action')}</Section.Title>
          </Section.Header>
          <MonitoringSettings kind={kind} monitored={monitored} busy={busy} onMonitor={monitor} />
        </Section.Root>

        {kind === 'show' && ledger.data ? (
          <Section.Root>
            <Section.Header>
              <Section.Title>{t('monitoring.seasons')}</Section.Title>
            </Section.Header>
            <SeasonList
              tmdbId={tmdbId}
              title={title}
              poster={ledger.data.posterUrl}
              seasons={ledger.data.seasons}
              today={ledger.data.today}
              followed={monitored !== null}
              isSaving={episodes.isSaving}
              onToggle={episodes.set}
            />
          </Section.Root>
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

      <MonitoringNotice notice={notice} on={on} />
    </>
  );
}

function NoAcquisition() {
  const t = useT();
  return (
    <Surface radius="xl" pad="none" px={28}>
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
