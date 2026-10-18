import { TABULAR, Table, type TableColumn, useT } from '@kromatv/module-sdk';
import {
  Box,
  Button,
  EmptyState,
  Img,
  Table as Kit,
  Row,
  Section,
  Surface,
  TableSkeleton,
  Text,
} from '@kromatv/ui/kit';
import { Link } from '@tanstack/react-router';
import { useAcquisitionApi } from './api';
import type { CutoffEntry } from './judgement-schemas';
import { useQualityLabel } from './use-quality-label';
import { useCutoffTitles } from './use-rules';
import { useSearchNow } from './use-search-now';

const COLUMNS: TableColumn[] = [
  { min: 200 },
  { width: 150, from: 'md' },
  { width: 160, from: 'md' },
  { width: 150 },
];

const POSTER_W = 32;
const POSTER_H = 48;

export function CutoffView() {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const cutoff = useCutoffTitles();
  const searchNow = useSearchNow();
  const entries = cutoff.data ?? [];

  if (cutoff.loading) return <TableSkeleton rows={5} />;

  return (
    <Section.Root gap={14}>
      <Section.Header>
        <Section.Title>{t('acq.tabCutoff')}</Section.Title>
        {entries.length === 0 ? null : (
          <Section.Actions>
            <Button
              size="sm"
              icon="sparkles"
              label={t('acq.improveAll')}
              loading={searchNow.busy}
              onPress={() => searchNow.start(() => acquisition.searchCutoffNow())}
            />
          </Section.Actions>
        )}
      </Section.Header>

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
    </Section.Root>
  );
}

function CutoffRow({ entry }: Readonly<{ entry: CutoffEntry }>) {
  const t = useT();
  const label = useQualityLabel();
  return (
    <Kit.Row asChild>
      <Link to={`/admin/monitoring/${entry.kind}/${entry.tmdbId}`}>
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
            {entry.bestQuality ? label(entry.bestQuality) : t('common.none')}
          </Text>
        </Table.Cell>
        <Table.Cell>
          <Text variant="meta" color="accentText" style={TABULAR} lines={2}>
            {t(entry.kind === 'movie' ? 'acq.belowOfFilms' : 'acq.belowOfEpisodes', {
              below: entry.below,
              units: entry.units,
            })}
          </Text>
        </Table.Cell>
      </Link>
    </Kit.Row>
  );
}
