import type { IndexerReport, ScoredReleaseView } from '@kromatv/client/requests';
import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, Chip, EmptyState, Row, SegmentGroup } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { IndexerReportStrip, nothingAnswered } from './indexer-report';
import { ReleaseRow } from './release-row';
import { filterReleases, type ReleaseFilter, type ReleaseSort, sortReleases } from './release-sort';

const COLUMNS: TableColumn[] = [
  {},
  { width: 136 },
  { width: 150, from: 'md' },
  { width: 92, from: 'md' },
  { width: 84, from: 'md' },
  { width: 74 },
  { width: 44 },
];

const SORTS: ReleaseSort[] = ['score', 'size', 'seeders', 'date'];

const SORT_LABEL: Record<ReleaseSort, string> = {
  score: 'requests.colScore',
  size: 'requests.colSize',
  seeders: 'requests.colSeeders',
  date: 'requests.colPublished',
};

export function ReleaseTable({
  releases,
  indexers = [],
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  releases: ScoredReleaseView[];
  /** Every indexer the sweep asked, answered or not. */
  indexers?: IndexerReport[];
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const [sort, setSort] = useState<ReleaseSort>('score');
  const [filter, setFilter] = useState<ReleaseFilter>('accepted');

  const acceptedCount = releases.filter((r) => r.score != null).length;
  const rejectedCount = releases.length - acceptedCount;
  const unsearched = releases.length === 0 && nothingAnswered(indexers);
  const rows = useMemo(
    () => sortReleases(filterReleases(releases, filter), sort),
    [releases, filter, sort],
  );

  return (
    <Box gap={12}>
      <IndexerReportStrip indexers={indexers} />

      <Row wrap between gap={10}>
        <Row wrap gap={8}>
          <Chip
            label={t('requests.filter.accepted')}
            count={acceptedCount}
            dot="success"
            active={filter === 'accepted'}
            onPress={() => setFilter('accepted')}
          />
          <Chip
            label={t('requests.filter.rejected')}
            count={rejectedCount}
            dot="danger"
            active={filter === 'rejected'}
            onPress={() => setFilter('rejected')}
          />
          <Chip
            label={t('requests.filter.all')}
            count={releases.length}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
        </Row>
        <SegmentGroup.Root value={sort} onValueChange={setSort} label={t('requests.sortBy')}>
          {SORTS.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(SORT_LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Row>

      {rows.length === 0 ? (
        <Box py={20}>
          <EmptyState.Root icon={unsearched ? 'alert-triangle' : 'search'}>
            <EmptyState.Title>
              {t(unsearched ? 'requests.indexersAllFailed' : 'requests.noReleases')}
            </EmptyState.Title>
          </EmptyState.Root>
        </Box>
      ) : (
        <Table.Root columns={COLUMNS}>
          <Table.Header>
            <Table.Column>{t('requests.colRelease')}</Table.Column>
            <Table.Column>{t('acq.colQuality')}</Table.Column>
            <Table.Column>{t('requests.colIndexer')}</Table.Column>
            <Table.Column>{t('requests.colSize')}</Table.Column>
            <Table.Column>{t('requests.colSeeders')}</Table.Column>
            <Table.Column>{t('requests.colScore')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {rows.map((release) => (
            <ReleaseRow
              key={`${release.indexerId}-${release.guid}`}
              release={release}
              canGrab={canGrab}
              busy={busy}
              onGrab={onGrab}
            />
          ))}
        </Table.Root>
      )}
    </Box>
  );
}
