import type { ElementCounts } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Row } from '@kroma/ui/kit';
import { Chip } from '#web/features/admin/table-console';

export function PipelineFilters({
  status,
  kind,
  counts: c,
  total,
  attention,
  onPick,
}: Readonly<{
  status: string;
  kind: string;
  counts: ElementCounts | undefined;
  total: number;
  attention: number;
  onPick: (facet: 'status' | 'kind', value: string) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} mb={16}>
      <Chip
        label={t('pipeline.filter.attention')}
        count={attention}
        dot="accent"
        on={status === 'attention'}
        tone="accent"
        onClick={() => onPick('status', 'attention')}
      />
      <Chip
        label={t('pipeline.filter.failed')}
        count={c?.failed}
        dot="danger"
        on={status === 'failed'}
        tone="accent"
        onClick={() => onPick('status', 'failed')}
      />
      <Chip
        label={t('pipeline.filter.running')}
        count={c?.running}
        dot="accent"
        on={status === 'running'}
        tone="accent"
        onClick={() => onPick('status', 'running')}
      />
      <Chip
        label={t('pipeline.filter.pending')}
        count={c?.pending}
        dot="text/45"
        on={status === 'pending'}
        tone="accent"
        onClick={() => onPick('status', 'pending')}
      />
      <Chip
        label={t('pipeline.filter.ok')}
        count={c?.ok}
        dot="success"
        on={status === 'ok'}
        tone="accent"
        onClick={() => onPick('status', 'ok')}
      />
      <Chip
        label={t('pipeline.filter.all')}
        count={total}
        on={status === 'all'}
        tone="accent"
        onClick={() => onPick('status', 'all')}
      />
      <Box mx={4} w={1} h={22} bg="tint/12" />
      <Chip
        label={t('pipeline.filter.allTypes')}
        count={total}
        on={kind === 'all'}
        tone="blue"
        onClick={() => onPick('kind', 'all')}
      />
      <Chip
        label={t('pipeline.filter.films')}
        count={c?.film}
        on={kind === 'film'}
        tone="blue"
        onClick={() => onPick('kind', 'film')}
      />
      <Chip
        label={t('pipeline.filter.series')}
        count={c?.series}
        on={kind === 'series'}
        tone="blue"
        onClick={() => onPick('kind', 'series')}
      />
      <Chip
        label={t('pipeline.filter.episodes')}
        count={c?.episode}
        on={kind === 'episode'}
        tone="blue"
        onClick={() => onPick('kind', 'episode')}
      />
    </Row>
  );
}
