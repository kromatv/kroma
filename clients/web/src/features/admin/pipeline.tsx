import { type ElementRow, type KromaClient, KromaEvents, type MessageKey } from '@kroma/core';
import { TABULAR, Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, Button, Callout, color, Divider, EmptyState, Legend, Row, Text } from '@kroma/ui/kit';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { PipelineDrawer } from '#web/features/admin/pipeline-drawer';
import { ElementRowView } from '#web/features/admin/pipeline-row';
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

const PER_PAGE = 30;

const RESUME_FILL = {
  backgroundColor: color('success/14'),
  borderColor: color('success/40'),
} as const;
const apiKind = (el: ElementRow): 'item' | 'show' => (el.kind === 'series' ? 'show' : 'item');

const RELOAD_EVENTS = new Set([
  'pipeline.stats',
  'job.finished',
  'job.started',
  'item.updated',
  'show.updated',
  'library.updated',
]);

function usePipelineReloadEvents(onReload: () => void): void {
  useEffect(() => {
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (RELOAD_EVENTS.has(e.type)) onReload();
      },
    });
    ev.connect();
    return () => ev.close();
  }, [onReload]);
}

function pipelineActions(deps: {
  client: KromaClient;
  canManage: boolean;
  t: ReturnType<typeof useT>;
  reload: () => void;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  flash: (text: string) => void;
}) {
  const { client, canManage, t, reload, paused, setPaused, setBusy, flash } = deps;
  const togglePause = () => {
    if (!canManage) return;
    const next = !paused;
    setPaused(next); // optimistic
    client
      .pausePipeline(next)
      .then((r) => {
        setPaused(r.paused);
        flash(t(next ? 'pipeline.toastPaused' : 'pipeline.toastResumed'));
      })
      .catch(() => setPaused(!next));
  };
  const reprocess = (el: ElementRow) => {
    if (!canManage) return;
    setBusy(true);
    client
      .reprocessSubject(apiKind(el), el.id)
      .then(() => {
        flash(`« ${el.title} » ${t('pipeline.toastReprocess')}`);
        reload();
      })
      .finally(() => setBusy(false));
  };
  const retryStage = (el: ElementRow, stage: string) => {
    if (!canManage) return;
    setBusy(true);
    client
      .retryElementStage(apiKind(el), el.id, stage)
      .then(() => {
        const stageName = t(`pipeline.t.${stage}` as MessageKey);
        flash(`${stageName} ${t('pipeline.toastRetry')}`);
        reload();
      })
      .finally(() => setBusy(false));
  };
  return { togglePause, reprocess, retryStage };
}

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

      <Row wrap gap={10} mb={16}>
        <Chip
          label={t('pipeline.filter.attention')}
          count={attention}
          dot="accent"
          on={status === 'attention'}
          tone="accent"
          onClick={() => pick(setStatus)('attention')}
        />
        <Chip
          label={t('pipeline.filter.failed')}
          count={c?.failed}
          dot="danger"
          on={status === 'failed'}
          tone="accent"
          onClick={() => pick(setStatus)('failed')}
        />
        <Chip
          label={t('pipeline.filter.running')}
          count={c?.running}
          dot="accent"
          on={status === 'running'}
          tone="accent"
          onClick={() => pick(setStatus)('running')}
        />
        <Chip
          label={t('pipeline.filter.pending')}
          count={c?.pending}
          dot="text/45"
          on={status === 'pending'}
          tone="accent"
          onClick={() => pick(setStatus)('pending')}
        />
        <Chip
          label={t('pipeline.filter.ok')}
          count={c?.ok}
          dot="success"
          on={status === 'ok'}
          tone="accent"
          onClick={() => pick(setStatus)('ok')}
        />
        <Chip
          label={t('pipeline.filter.all')}
          count={total}
          on={status === 'all'}
          tone="accent"
          onClick={() => pick(setStatus)('all')}
        />
        <Box mx={4} w={1} h={22} bg="tint/12" />
        <Chip
          label={t('pipeline.filter.allTypes')}
          count={total}
          on={kind === 'all'}
          tone="blue"
          onClick={() => pick(setKind)('all')}
        />
        <Chip
          label={t('pipeline.filter.films')}
          count={c?.film}
          on={kind === 'film'}
          tone="blue"
          onClick={() => pick(setKind)('film')}
        />
        <Chip
          label={t('pipeline.filter.series')}
          count={c?.series}
          on={kind === 'series'}
          tone="blue"
          onClick={() => pick(setKind)('series')}
        />
        <Chip
          label={t('pipeline.filter.episodes')}
          count={c?.episode}
          on={kind === 'episode'}
          tone="blue"
          onClick={() => pick(setKind)('episode')}
        />
      </Row>

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
          <>
            <Divider color="tint/6" />
            <Row between wrap gap={16} px={20} py={14} bg="bg">
              <Row wrap gap={16}>
                <Text variant="meta" color="textDim" style={TABULAR}>
                  {(start + 1).toLocaleString()}–
                  {Math.min(start + PER_PAGE, data?.total ?? 0).toLocaleString()} /{' '}
                  {(data?.total ?? 0).toLocaleString()}
                </Text>
                <Legend.Root>
                  <Legend.Item color="success">{t('pipeline.st.done')}</Legend.Item>
                  <Legend.Item color="accent">{t('pipeline.st.running')}</Legend.Item>
                  <Legend.Item color="tint/30">{t('pipeline.st.pending')}</Legend.Item>
                  <Legend.Item color="danger">{t('pipeline.st.failed')}</Legend.Item>
                </Legend.Root>
              </Row>
              <Row gap={10}>
                <Pager
                  dir="prev"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  label={t('pipeline.prev')}
                />
                <Text variant="meta" color="textDim" style={TABULAR}>
                  {t('pipeline.page')} {page + 1} / {(data?.pages ?? 1).toLocaleString()}
                </Text>
                <Pager
                  dir="next"
                  disabled={page >= (data?.pages ?? 1) - 1}
                  onClick={() => setPage((p) => p + 1)}
                  label={t('pipeline.next')}
                />
              </Row>
            </Row>
          </>
        ) : null}
      </Table.Root>

      <ConsoleToast toast={toast} />
    </>
  );
}

function Pager({
  dir,
  disabled,
  onClick,
  label,
}: Readonly<{ dir: 'prev' | 'next'; disabled: boolean; onClick: () => void; label: string }>) {
  return (
    <Button
      variant="glass"
      size="sm"
      icon={dir === 'prev' ? 'chevron-left' : undefined}
      iconRight={dir === 'next' ? 'chevron-right' : undefined}
      label={label}
      onPress={onClick}
      disabled={disabled}
    />
  );
}
