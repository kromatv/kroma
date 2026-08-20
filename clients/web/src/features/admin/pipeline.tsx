import type { ElementRow } from '@kroma/core';
import { Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, Button, Callout, color, EmptyState, Row } from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { pipelineActions, usePipelineReloadEvents } from '#web/features/admin/pipeline-actions';
import { PipelineDrawer } from '#web/features/admin/pipeline-drawer';
import { PipelineFilters } from '#web/features/admin/pipeline-filters';
import { PipelineFooter } from '#web/features/admin/pipeline-footer';
import { ElementRowView } from '#web/features/admin/pipeline-row';
import { PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import {
  ConsoleSearch,
  ConsoleSummary,
  ConsoleToast,
  useConsoleToast,
  useThrottledReload,
} from '#web/features/admin/table-console';
import { useAuth } from '#web/shared/lib/auth';

const PER_PAGE = 30;

const RESUME_FILL = {
  backgroundColor: color('success/14'),
  borderColor: color('success/40'),
} as const;

export function PipelinePage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('settings.manage');

  const [status, setStatus] = useState('attention');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(0);
  // A ref, not render state: the drawer is imperative, and live reloads push
  // fresh statuses into the open instance via PipelineDrawer.update().
  const openEl = useRef<ElementRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const { toast, flash } = useConsoleToast();

  useEffect(() => {
    const h = setTimeout(() => {
      setDq(q);
      setPage(0);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  // Refresh is event-driven; the slow poll is only a reconnect/missed-event net.
  const { data, reload } = usePoll(
    ['admin', 'pipeline', 'elements', status, kind, dq, page],
    () => client.pipelineElements({ status, kind, q: dq, page, limit: PER_PAGE }),
    30000,
  );

  // A draining stage fires pipeline.stats ~1/s and enrich fires many item.updated.
  const throttledReload = useThrottledReload(reload);

  usePipelineReloadEvents(throttledReload);

  useEffect(() => {
    const cur = openEl.current;
    if (!cur) return;
    const fresh = data?.elements.find((e) => e.id === cur.id) ?? cur;
    openEl.current = fresh;
    PipelineDrawer.update({ el: fresh, busy });
  }, [data, busy]);

  // Polled so another admin's toggle shows, mirrored into state so this one can
  // update optimistically.
  const { data: health } = usePoll(
    ['admin', 'pipeline', 'health'],
    () => client.adminPipeline(),
    30000,
  );
  useEffect(() => {
    if (health) setPaused(health.paused);
  }, [health]);

  const { togglePause, reprocess, retryStage } = pipelineActions({
    client,
    canManage,
    t,
    reload,
    paused,
    setPaused,
    setBusy,
    flash,
  });

  const openDrawer = (el: ElementRow) => {
    openEl.current = el;
    void PipelineDrawer.call({
      el,
      busy,
      onReprocess: () => reprocess(el),
      onRetryStage: (stage) => retryStage(el, stage),
    }).finally(() => {
      openEl.current = null;
    });
  };

  const c = data?.counts;
  const total = c?.total ?? 0;
  const attention = c ? c.failed + c.running + c.pending : 0;
  const rows = data?.elements ?? [];
  const start = page * PER_PAGE;

  const pick = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(0);
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.pipelineTitle')}</PageHeader.Title>
        <PageHeader.Actions>
          <Row wrap minW={0} gap={12}>
            {canManage ? (
              <Button
                variant="glass"
                size="sm"
                icon={paused ? 'player-play' : 'player-pause'}
                label={t(paused ? 'pipeline.resume' : 'pipeline.pause')}
                onPress={togglePause}
                style={paused ? RESUME_FILL : null}
              />
            ) : null}
            <ConsoleSearch
              value={q}
              onChange={setQ}
              placeholder={t('pipeline.searchPlaceholder')}
            />
          </Row>
        </PageHeader.Actions>
      </PageHeader.Root>
      <ConsoleSummary
        total={total}
        totalLabel={t('pipeline.trackedLabel')}
        accent={attention}
        accentLabel={t('pipeline.needActionLabel')}
      />

      {paused ? (
        <Box mb={16}>
          <Callout.Root tone="accent" icon="player-pause">
            <Callout.Title>{t('pipeline.pausedBanner')}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}
      <PipelineFilters
        status={status}
        kind={kind}
        counts={c}
        total={total}
        attention={attention}
        onPick={(facet, value) => pick(facet === 'status' ? setStatus : setKind)(value)}
      />

      <Table.Root columns="minmax(0,1fr) 150px 132px 46px">
        <Table.Header>
          <Table.Column>{t('pipeline.colElement')}</Table.Column>
          <Table.Column wide>{t('pipeline.treatments')}</Table.Column>
          <Table.Column wide>{t('pipeline.colStatus')}</Table.Column>
          <Table.Cell />
        </Table.Header>

        {rows.map((el) => (
          <ElementRowView
            key={`${el.kind}-${el.id}`}
            el={el}
            onOpen={() => openDrawer(el)}
            onReprocess={() => reprocess(el)}
          />
        ))}

        {data && rows.length === 0 ? (
          <EmptyState.Root icon="inbox">
            <EmptyState.Title>{t('pipeline.noMatch')}</EmptyState.Title>
          </EmptyState.Root>
        ) : null}

        {rows.length > 0 ? (
          <PipelineFooter
            start={start}
            perPage={PER_PAGE}
            total={data?.total ?? 0}
            page={page}
            pages={data?.pages ?? 1}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </Table.Root>

      <ConsoleToast toast={toast} />
    </>
  );
}
