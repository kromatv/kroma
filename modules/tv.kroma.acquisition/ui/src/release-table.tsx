import type { IndexerReport, ScoredReleaseView } from '@kromatv/client/requests';
import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState } from '@kromatv/ui/kit';
import { IndexerReportStrip, nothingAnswered } from './indexer-report';
import { ReleaseRow } from './release-row';
import { releaseSortOf } from './release-sort';
import type { ReleaseView } from './use-release-view';

const COLUMNS: TableColumn[] = [
  { min: 220 },
  { width: 136, from: 'md' },
  { width: 150, from: 'md' },
  { width: 104, from: 'md', column: 'size' },
  { width: 116, from: 'md', column: 'seeders' },
  { width: 104, from: 'md', column: 'score' },
  { width: 44, from: 'md' },
];

export function ReleaseTable({
  view,
  indexers = [],
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  view: ReleaseView;
  indexers?: IndexerReport[];
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const unsearched = view.rows.length === 0 && nothingAnswered(indexers);

  if (view.rows.length === 0) {
    return (
      <Box gap={12}>
        <IndexerReportStrip indexers={indexers} />
        <Box py={20}>
          <EmptyState.Root icon={unsearched ? 'alert-triangle' : 'search'}>
            <EmptyState.Title>
              {t(unsearched ? 'requests.indexersAllFailed' : 'requests.noReleases')}
            </EmptyState.Title>
          </EmptyState.Root>
        </Box>
      </Box>
    );
  }

  return (
    <Box gap={12}>
      <IndexerReportStrip indexers={indexers} />
      <Table.Root
        columns={COLUMNS}
        label={t('acq.releaseTable')}
        sort={view.columns}
        onSortChange={(_, details) => {
          const picked = releaseSortOf(details.column);
          if (picked) view.setSort(picked);
        }}
      >
        <Table.Header>
          <Table.Column>{t('acq.colRelease')}</Table.Column>
          <Table.Column>{t('acq.colQuality')}</Table.Column>
          <Table.Column>{t('requests.colIndexer')}</Table.Column>
          <Table.Column>{t('requests.colSize')}</Table.Column>
          <Table.Column>{t('acq.colSeeders')}</Table.Column>
          <Table.Column>{t('requests.colScore')}</Table.Column>
          <Table.Cell />
        </Table.Header>
        {view.rows.map((release) => (
          <ReleaseRow
            key={`${release.indexerId}-${release.guid}`}
            release={release}
            canGrab={canGrab}
            busy={busy}
            onGrab={onGrab}
          />
        ))}
      </Table.Root>
    </Box>
  );
}
