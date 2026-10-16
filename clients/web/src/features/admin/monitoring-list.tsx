import { Table } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Button, EmptyState, Row, SegmentGroup } from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MonitorTitlesDialog } from '#web/features/admin/monitoring-add-dialog';
import { filterMonitored, type MonitoringKind } from '#web/features/admin/monitoring-model';
import { MonitoredRowView } from '#web/features/admin/monitoring-row';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import {
  Chip,
  ConsoleSearch,
  ConsoleSummary,
  ConsoleToast,
  useConsoleToast,
} from '#web/features/admin/table-console';
import { useMonitoredTitles } from '#web/features/admin/use-monitoring';
import { TableSkeleton } from '#web/shared/ui';

const COLUMNS = [
  {},
  { width: 110, from: 'md' },
  { width: 190, from: 'md' },
  { width: 150, from: 'lg' },
  { width: 44 },
] as const;

export function MonitoringListPage() {
  if (!useCap('library.manage')) return <Denied />;
  return <MonitoringList />;
}

function MonitoringList() {
  const t = useT();
  const navigate = useNavigate();
  const { toast, flash } = useConsoleToast();
  const { data, reload } = useMonitoredTitles();

  const [kind, setKind] = useState<MonitoringKind>('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [needle, setNeedle] = useState('');
  const [adding, setAdding] = useState(false);

  const titles = data ?? [];
  const rows = useMemo(
    () => filterMonitored(titles, { kind, onlyMissing, needle }),
    [titles, kind, onlyMissing, needle],
  );
  const withGaps = titles.filter((title) => title.missing > 0).length;

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('monitoring.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('monitoring.subtitle')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <ConsoleSearch
            value={needle}
            onChange={setNeedle}
            placeholder={t('monitoring.searchPlaceholder')}
          />
          <Button
            size="sm"
            icon="plus"
            label={t('monitoring.addTitle')}
            onPress={() => setAdding(true)}
          />
        </PageHeader.Actions>
      </PageHeader.Root>
      <ConsoleSummary
        total={titles.length}
        totalLabel={t('monitoring.totalLabel')}
        accent={withGaps}
        accentLabel={t('monitoring.gapsLabel')}
      />

      <Row wrap gap={10} mb={16}>
        <SegmentGroup.Root value={kind} onValueChange={setKind} label={t('monitoring.colTitle')}>
          <SegmentGroup.Item value="all">
            <SegmentGroup.Label>{t('monitoring.filter.all')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="movie">
            <SegmentGroup.Label>{t('monitoring.filter.movies')}</SegmentGroup.Label>
          </SegmentGroup.Item>
          <SegmentGroup.Item value="show">
            <SegmentGroup.Label>{t('monitoring.filter.shows')}</SegmentGroup.Label>
          </SegmentGroup.Item>
        </SegmentGroup.Root>
        <Chip
          label={t('monitoring.filter.withMissing')}
          count={withGaps}
          dot="accent"
          on={onlyMissing}
          onClick={() => setOnlyMissing((on) => !on)}
        />
      </Row>

      <Table.Root label={t('monitoring.title')} columns={COLUMNS}>
        <Table.Header>
          <Table.Column>{t('monitoring.colTitle')}</Table.Column>
          <Table.Column>{t('monitoring.colTracked')}</Table.Column>
          <Table.Column>{t('monitoring.colMissing')}</Table.Column>
          <Table.Column>{t('monitoring.colStatus')}</Table.Column>
          <Table.Cell />
        </Table.Header>

        {rows.map((title) => (
          <MonitoredRowView
            key={`${title.kind}:${title.tmdbId}`}
            title={title}
            onOpen={() =>
              void navigate({
                to: '/admin/monitoring/$kind/$tmdbId',
                params: { kind: title.kind, tmdbId: String(title.tmdbId) },
              })
            }
          />
        ))}

        {data === null ? <TableSkeleton rows={8} /> : null}

        {data && rows.length === 0 ? (
          <EmptyState.Root icon="device-tv">
            <EmptyState.Title>
              {titles.length === 0 ? t('monitoring.empty') : t('monitoring.noMatch')}
            </EmptyState.Title>
            {titles.length === 0 ? (
              <EmptyState.Hint>{t('monitoring.emptyHint')}</EmptyState.Hint>
            ) : null}
          </EmptyState.Root>
        ) : null}
      </Table.Root>

      <MonitorTitlesDialog
        open={adding}
        monitored={titles}
        onClose={() => setAdding(false)}
        onDone={(message) => {
          flash(message);
          void reload();
        }}
      />
      <ConsoleToast toast={toast} />
    </>
  );
}
