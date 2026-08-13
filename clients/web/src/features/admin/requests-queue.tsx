// Admin "Demandes" queue: every media request as a searchable / filterable
// table (mirroring the pipeline console's shape), with quick approve/deny and
// a detail drawer. Backed by GET /api/requests + the request.updated WS event.

import { KromaEvents, type MediaRequest, type RequestStatus } from '@kroma/core';
import { Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Button, EmptyState, Row } from '@kroma/ui/kit';

import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { NewRequestDialog } from '#web/features/admin/request-new-dialog';
import { RequestRowView } from '#web/features/admin/request-row';
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

const BUCKETS: Record<string, (s: RequestStatus) => boolean> = {
  pending: (s) => s === 'pending',
  active: (s) =>
    s === 'approved' ||
    s === 'searching' ||
    s === 'downloading' ||
    s === 'importing' ||
    s === 'partially_available',
  available: (s) => s === 'available',
  closed: (s) => s === 'denied' || s === 'failed',
  all: () => true,
};

export function RequestsQueuePage() {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const canReview = useCap('requests.manage');

  const [bucket, setBucket] = useState('pending');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const { toast, flash } = useConsoleToast();

  const { data, reload } = usePoll(
    ['admin', 'requests', 'all'],
    () => client.listRequests(),
    30000,
  );

  // Event-driven refresh, coalesced (request.updated is low-frequency, but an
  // approval fans out into several transitions in a row).
  const throttledReload = useThrottledReload(reload);
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (e.type === 'request.updated') throttledReload();
      },
    });
    ev.connect();
    return () => ev.close();
  }, [throttledReload]);

  // The detail page subscribes to this same query (shared cache), so it stays
  // fresh here without an explicit push.
  const act = (label: string, fn: () => Promise<unknown>) => {
    if (!canReview) return Promise.resolve();
    return fn()
      .then(() => {
        flash(label);
        reload();
      })
      .catch(() => flash(t('requests.actionFailed')));
  };
  const approve = (r: MediaRequest) =>
    act(`« ${r.title} » ${t('requests.toastApproved')}`, () => client.approveRequest(r.id));
  const deny = (r: MediaRequest, note?: string) =>
    act(`« ${r.title} » ${t('requests.toastDenied')}`, () => client.denyRequest(r.id, note));
  const open = (r: MediaRequest) => navigate({ to: '/admin/requests/$id', params: { id: r.id } });

  const all = data?.requests ?? [];
  const c = data?.counts;
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      BUCKETS[bucket]?.(r.status) &&
      (!needle ||
        r.title.toLowerCase().includes(needle) ||
        (r.requestedByName ?? '').toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.requestsTitle')}</PageHeader.Title>
        <PageHeader.Actions>
          <ConsoleSearch value={q} onChange={setQ} placeholder={t('requests.searchPlaceholder')} />
          {canReview ? (
            <Button
              size="sm"
              icon="plus"
              label={t('requests.newRequest')}
              onPress={() => setAdding(true)}
            />
          ) : null}
        </PageHeader.Actions>
      </PageHeader.Root>
      <ConsoleSummary
        total={c?.total ?? 0}
        totalLabel={t('requests.totalLabel')}
        accent={c?.pending ?? 0}
        accentLabel={t('requests.pendingLabel')}
      />

      <Row wrap gap={10} mb={16}>
        <Chip
          label={t('requests.filter.pending')}
          count={c?.pending}
          dot="text/45"
          on={bucket === 'pending'}
          onClick={() => setBucket('pending')}
        />
        <Chip
          label={t('requests.filter.active')}
          count={c?.active}
          dot="accent"
          on={bucket === 'active'}
          onClick={() => setBucket('active')}
        />
        <Chip
          label={t('requests.filter.available')}
          count={c?.available}
          dot="success"
          on={bucket === 'available'}
          onClick={() => setBucket('available')}
        />
        <Chip
          label={t('requests.filter.closed')}
          count={(c?.denied ?? 0) + (c?.failed ?? 0)}
          dot="danger"
          on={bucket === 'closed'}
          onClick={() => setBucket('closed')}
        />
        <Chip
          label={t('requests.filter.all')}
          count={c?.total}
          on={bucket === 'all'}
          onClick={() => setBucket('all')}
        />
      </Row>

      <Table.Root columns="minmax(0,1fr) 190px 110px 132px 76px">
        <Table.Header>
          <Table.Column>{t('requests.colTitle')}</Table.Column>
          <Table.Column wide>{t('requests.colRequester')}</Table.Column>
          <Table.Column wide>{t('requests.colDate')}</Table.Column>
          <Table.Column wide>{t('requests.colStatus')}</Table.Column>
          <Table.Cell />
        </Table.Header>

        {rows.map((r) => (
          <RequestRowView
            key={r.id}
            req={r}
            canReview={canReview}
            onOpen={() => void open(r)}
            onApprove={() => approve(r)}
            onDeny={() => deny(r)}
          />
        ))}

        {data === null ? <TableSkeleton rows={8} /> : null}

        {data && rows.length === 0 ? (
          <EmptyState.Root icon="inbox">
            <EmptyState.Title>
              {all.length === 0 ? t('requests.empty') : t('requests.noMatch')}
            </EmptyState.Title>
          </EmptyState.Root>
        ) : null}
      </Table.Root>

      <NewRequestDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={reload}
        onOpenRequest={(id) => {
          setAdding(false);
          reload();
          navigate({ to: '/admin/requests/$id', params: { id } });
        }}
      />
      <ConsoleToast toast={toast} />
    </>
  );
}
