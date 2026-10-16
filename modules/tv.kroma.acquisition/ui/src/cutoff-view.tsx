import { TABULAR, Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState, Img, Row, Surface, TableSkeleton, Text } from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import type { CutoffEntry } from './rules-schemas';
import { useCutoffTitles } from './use-rules';

const COLUMNS: TableColumn[] = [
  {},
  { width: 150, from: 'md' },
  { width: 130, from: 'md' },
  { width: 96 },
];

const POSTER_W = 32;
const POSTER_H = 48;

export function CutoffView() {
  const t = useT();
  const cutoff = useCutoffTitles();
  const entries = cutoff.data ?? [];

  if (cutoff.loading) return <TableSkeleton rows={5} />;

  return (
    <Box gap={14}>
      <Text variant="meta" color="textDim">
        {t('acq.cutoffHint')}
      </Text>

      {entries.length === 0 ? (
        <Surface radius="xl" pad="lg">
          <EmptyState.Root icon="target">
            <EmptyState.Title>{t('acq.cutoffEmpty')}</EmptyState.Title>
            <EmptyState.Hint>{t('acq.cutoffEmptyHint')}</EmptyState.Hint>
          </EmptyState.Root>
        </Surface>
      ) : (
        <Table.Root columns={COLUMNS} label={t('acq.tabCutoff')}>
          <Table.Header>
            <Table.Column>{t('requests.colTitle')}</Table.Column>
            <Table.Column>{t('acq.colProfile')}</Table.Column>
            <Table.Column>{t('acq.colBestQuality')}</Table.Column>
            <Table.Column>{t('acq.colBelow')}</Table.Column>
          </Table.Header>
          {entries.map((entry) => (
            <CutoffRow key={`${entry.kind}-${entry.tmdbId}`} entry={entry} />
          ))}
        </Table.Root>
      )}
    </Box>
  );
}

function CutoffRow({ entry }: Readonly<{ entry: CutoffEntry }>) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Table.Row onPress={() => navigate({ to: `/admin/monitoring/${entry.kind}/${entry.tmdbId}` })}>
      <Table.Cell>
        <Row gap={10} align="center">
          <Box w={POSTER_W} h={POSTER_H} shrink={0} radius={4} overflow="hidden" bg="tint/5">
            {entry.posterUrl ? <Img src={entry.posterUrl} fill /> : null}
          </Box>
          <Box minW={0} flex>
            <Text variant="meta" lines={1}>
              {entry.title}
            </Text>
            <Text variant="meta" color="textDim">
              {t(entry.kind === 'movie' ? 'acq.kindMovie' : 'acq.kindShow')}
              {entry.year ? ` · ${entry.year}` : ''}
            </Text>
          </Box>
        </Row>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {entry.profileName}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {entry.bestQuality ?? t('common.none')}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="accentText" style={TABULAR}>
          {t('acq.belowOf', { below: entry.below, units: entry.units })}
        </Text>
      </Table.Cell>
    </Table.Row>
  );
}
