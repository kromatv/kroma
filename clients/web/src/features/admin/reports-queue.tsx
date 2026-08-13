// Admin "Signalements" queue: every user-submitted problem report as a
// searchable / filterable table (mirroring the Demandes queue), with a triage
// drawer. Backed by GET /api/admin/reports + the report.updated WS event.

import { KromaEvents, type Report, type ReportCategory, type ReportStatus } from '@kroma/core';
import { TABULAR, Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Avatar, EmptyState, Row, Text } from '@kroma/ui/kit';

import { useEffect, useState } from 'react';
import { Pill, PillDot } from '#web/features/admin/pill';
import { ReportDrawer } from '#web/features/admin/report-drawer';
import { categoryMeta, kindLabelKey, soft, statusMeta } from '#web/features/admin/report-meta';
import { PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import {
  Chip,
  ConsoleSearch,
  ConsoleSummary,
  ConsoleToast,
  useConsoleToast,
  useThrottledReload,
} from '#web/features/admin/table-console';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

type StatusBucket = ReportStatus | 'all';
type CategoryFilter = ReportCategory | 'all';

const CATEGORIES: ReportCategory[] = ['metadata', 'video', 'audio', 'subtitles', 'other'];

function ReportRow({ report, onOpen }: Readonly<{ report: Report; onOpen: () => void }>) {
  const t = useT();
  const cat = categoryMeta(report.category);
  const st = statusMeta(report.status);
  return (
    <Table.Row onPress={onOpen}>
      <Table.Cell>
        <Text variant="label" lines={1}>
          {report.subjectTitle}
        </Text>
        <Text variant="meta" color="textDim" lines={1} mt={3}>
          {t(kindLabelKey(report.subjectKind))}
          {report.message ? ` · ${report.message}` : ''}
        </Text>
      </Table.Cell>

      <Table.Cell wide>
        <Pill ink={cat.color} bg={soft(cat.color)} variant="overline">
          {t(cat.labelKey)}
        </Pill>
      </Table.Cell>

      <Table.Cell wide row gap={10}>
        <Avatar name={report.reportedByName ?? '?'} size={26} circle shadow={false} />
        <Text variant="meta" color="textMuted" lines={1}>
          {report.reportedByName ?? t('reports.unknownUser')}
        </Text>
      </Table.Cell>

      <Table.Cell wide>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {new Date(report.createdAt).toLocaleDateString()}
        </Text>
      </Table.Cell>

      <Table.Cell wide>
        <Pill ink={st.color} bg={soft(st.color)} leading={<PillDot tone={st.color} />}>
          {t(st.labelKey)}
        </Pill>
      </Table.Cell>
    </Table.Row>
  );
}

export function ReportsQueuePage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('reports.manage');

  const [status, setStatus] = useState<StatusBucket>('open');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [q, setQ] = useState('');
  const { toast, flash } = useConsoleToast();

  const { data, reload } = usePoll(['admin', 'reports'], () => client.adminReports(), 30000);

  const throttledReload = useThrottledReload(reload);
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (e.type === 'report.updated') throttledReload();
      },
    });
    ev.connect();
    return () => ev.close();
  }, [throttledReload]);

  // Refreshes the list + toasts on success; rejects on failure so the drawer
  // (which awaits this) can leave the report untouched.
  const act = (label: string, fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        flash(label);
        reload();
      })
      .catch((e) => {
        flash(t('reports.actionFailed'));
        throw e;
      });
  const resolve = (r: Report) =>
    act(`« ${r.subjectTitle} » ${t('reports.toastResolved')}`, () => client.resolveReport(r.id));
  const dismiss = (r: Report) =>
    act(`« ${r.subjectTitle} » ${t('reports.toastDismissed')}`, () => client.dismissReport(r.id));
  const reopen = (r: Report) =>
    act(`« ${r.subjectTitle} » ${t('reports.toastReopened')}`, () => client.reopenReport(r.id));
  const remove = (r: Report) =>
    act(`« ${r.subjectTitle} » ${t('reports.toastDeleted')}`, () => client.deleteReport(r.id));

  const openDrawer = (report: Report) =>
    ReportDrawer.call({
      report,
      canManage,
      onResolve: resolve,
      onDismiss: dismiss,
      onReopen: reopen,
      onDelete: remove,
    });

  const all = data?.reports ?? [];
  const c = data?.counts;
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      (category === 'all' || r.category === category) &&
      (!needle ||
        r.subjectTitle.toLowerCase().includes(needle) ||
        (r.reportedByName ?? '').toLowerCase().includes(needle)),
  );
  const catCount = (cat: ReportCategory) => all.filter((r) => r.category === cat).length;

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.reportsTitle')}</PageHeader.Title>
        <PageHeader.Actions>
          <ConsoleSearch value={q} onChange={setQ} placeholder={t('reports.searchPlaceholder')} />
        </PageHeader.Actions>
      </PageHeader.Root>
      <ConsoleSummary
        total={c?.total ?? 0}
        totalLabel={t('reports.totalLabel')}
        accent={c?.open ?? 0}
        accentLabel={t('reports.openLabel')}
      />

      <Row wrap gap={10} mb={12}>
        <Chip
          label={t('reports.status.open')}
          count={c?.open}
          dot="accent"
          on={status === 'open'}
          onClick={() => setStatus('open')}
        />
        <Chip
          label={t('reports.status.resolved')}
          count={c?.resolved}
          dot="success"
          on={status === 'resolved'}
          onClick={() => setStatus('resolved')}
        />
        <Chip
          label={t('reports.status.dismissed')}
          count={c?.dismissed}
          dot="glyph"
          on={status === 'dismissed'}
          onClick={() => setStatus('dismissed')}
        />
        <Chip
          label={t('reports.filterAll')}
          count={c?.total}
          on={status === 'all'}
          onClick={() => setStatus('all')}
        />
      </Row>

      <Row wrap gap={8} mb={16}>
        <Chip
          label={t('reports.filterAll')}
          on={category === 'all'}
          tone="blue"
          onClick={() => setCategory('all')}
        />
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={t(categoryMeta(cat).labelKey)}
            count={catCount(cat)}
            tone="blue"
            on={category === cat}
            onClick={() => setCategory(cat)}
          />
        ))}
      </Row>

      <Table.Root columns="minmax(0,1fr) 128px 150px 96px 116px">
        <Table.Header>
          <Table.Column>{t('reports.colTitle')}</Table.Column>
          <Table.Column wide>{t('reports.colCategory')}</Table.Column>
          <Table.Column wide>{t('reports.colReporter')}</Table.Column>
          <Table.Column wide>{t('reports.colDate')}</Table.Column>
          <Table.Column wide>{t('reports.colStatus')}</Table.Column>
        </Table.Header>

        {rows.map((r) => (
          <ReportRow key={r.id} report={r} onOpen={() => void openDrawer(r)} />
        ))}

        {data === null ? <TableSkeleton rows={8} /> : null}

        {data && rows.length === 0 ? (
          <EmptyState.Root icon="flag">
            <EmptyState.Title>
              {all.length === 0 ? t('reports.empty') : t('reports.noMatch')}
            </EmptyState.Title>
          </EmptyState.Root>
        ) : null}
      </Table.Root>

      <ConsoleToast toast={toast} />
    </>
  );
}
