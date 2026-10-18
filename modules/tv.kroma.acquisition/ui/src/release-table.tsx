import type { IndexerReport, ScoredReleaseView } from '@kromatv/client/requests';
import { Table, type TableColumn, useT } from '@kromatv/module-sdk';
import { Box, EmptyState, Row, Text } from '@kromatv/ui/kit';
import { IndexerReportStrip, nothingAnswered } from './indexer-report';
import { EFFECT_DOT, EFFECT_GROUP, groupByEffect } from './release-effect';
import { ReleaseRow } from './release-row';
import { releaseSortOf } from './release-sort';
import type { ReleaseView } from './use-release-view';

const COLUMNS: TableColumn[] = [
  { min: 360 },
  { width: 128, from: 'md' },
  { width: 104, from: 'md', column: 'size' },
  { width: 108, from: 'md', column: 'seeders' },
  { width: 104, from: 'md', column: 'score' },
  { width: 48, from: 'md' },
];

export function ReleaseTable({
  view,
  indexers = [],
  report = true,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  view: ReleaseView;
  indexers?: IndexerReport[];
  /** Show which indexers answered above the rows. Off where the caller shows
   *  it elsewhere. Defaults to true. */
  report?: boolean;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const unsearched = view.rows.length === 0 && nothingAnswered(indexers);

  if (view.rows.length === 0) {
    return (
      <Box gap={12}>
        {report ? <IndexerReportStrip indexers={indexers} /> : null}
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
      {report ? <IndexerReportStrip indexers={indexers} /> : null}
      {groupByEffect(view.rows).map((group, at) => (
        <Box key={group.effect} gap={8} mt={at === 0 ? 0 : 12}>
          <Row gap={8} align="center">
            <Box w={8} h={8} radius="pill" bg={EFFECT_DOT[group.effect]} />
            <Text variant="overline" color="textMuted">
              {t(EFFECT_GROUP[group.effect], { count: group.rows.length })}
            </Text>
          </Row>
          <Table.Root
            columns={COLUMNS}
            label={t(EFFECT_GROUP[group.effect], { count: group.rows.length })}
            sort={view.columns}
            onSortChange={(_, details) => {
              const picked = releaseSortOf(details.column);
              if (picked) view.setSort(picked);
            }}
          >
            {at === 0 ? (
              <Table.Header>
                <Table.Column>{t('acq.colRelease')}</Table.Column>
                <Table.Column>{t('acq.colQuality')}</Table.Column>
                <Table.Column>{t('requests.colSize')}</Table.Column>
                <Table.Column>{t('acq.colSeeders')}</Table.Column>
                <Table.Column>{t('requests.colScore')}</Table.Column>
                <Table.Cell />
              </Table.Header>
            ) : null}
            {group.rows.map((release) => (
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
      ))}
    </Box>
  );
}
