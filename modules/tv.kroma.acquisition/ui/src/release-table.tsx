// Interactive-search results as an aligned table: one row per release with its
// indexer, size, seeders and score, sortable by any of them, and an expandable
// score breakdown answering "why this one". Replaces the two stacked lists the
// request drawer used to show.

import type { IndexerReport, ScoredReleaseView } from '@kroma/core';
import { TABULAR, Table, useT } from '@kroma/module-sdk';
import { Box, Chip, Divider, EmptyState, Icon, Row, SegmentedControl, Text } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import { IndexerReportStrip } from './indexer-report';
import { ReleaseFacts } from './release-cells';
import {
  filterReleases,
  type ReleaseFilter,
  type ReleaseSort,
  sortReleases,
  targetLabel,
} from './release-sort';

const COLUMNS = 'minmax(0,1fr) 150px 92px 84px 74px 44px';

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
        <SegmentedControl.Root
          value={sort}
          onValueChange={setSort}
          label={t('requests.sortBy')}
          options={SORTS.map((s) => ({
            value: s,
            label: t(SORT_LABEL[s] as Parameters<typeof t>[0]),
          }))}
        />
      </Row>

      {rows.length === 0 ? (
        <Box py={20}>
          <EmptyState.Root icon="search">
            <EmptyState.Title>{t('requests.noReleases')}</EmptyState.Title>
          </EmptyState.Root>
        </Box>
      ) : (
        <Table.Root columns={COLUMNS}>
          <Table.Header>
            <Table.Column>{t('requests.colRelease')}</Table.Column>
            <Table.Column wide>{t('requests.colIndexer')}</Table.Column>
            <Table.Column wide>{t('requests.colSize')}</Table.Column>
            <Table.Column wide>{t('requests.colSeeders')}</Table.Column>
            <Table.Column>{t('requests.colScore')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {rows.map((r) => (
            <ReleaseRow
              key={`${r.indexerId}-${r.guid}`}
              r={r}
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

function grabLabelKey(upgrade: boolean, rejected: boolean): string {
  if (rejected) return 'requests.grabAnyway';
  return upgrade ? 'requests.grabUpgrade' : 'requests.grab';
}

function ReleaseRow({
  r,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  r: ScoredReleaseView;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rejected = r.score == null;
  const target = targetLabel(r);
  // Per release, from the server: what THIS grab covers is what decides whether
  // it replaces files, and the row is the button that does it.
  const upgrade = r.upgrade;

  return (
    <>
      <Table.Row onPress={() => setOpen((o) => !o)}>
        <Table.Cell>
          <Row gap={8}>
            <Icon
              name={open ? 'chevron-down' : 'chevron-right'}
              size={13}
              thickness={2.4}
              color="textDim"
            />
            <Box minW={0} flex>
              <Text variant="meta" lines={1} color={rejected ? 'textDim' : 'text'}>
                {r.title}
              </Text>
              <Row wrap gapX={10} mt={2}>
                {target ? (
                  <Text variant="meta" color="info">
                    {target}
                  </Text>
                ) : null}
                {r.rejected ? (
                  <Text variant="meta" color="dangerHover" lines={1}>
                    {r.rejected}
                  </Text>
                ) : null}
              </Row>
            </Box>
          </Row>
        </Table.Cell>
        <ReleaseFacts
          indexerName={r.indexerName}
          detailsUrl={r.detailsUrl}
          sizeBytes={r.sizeBytes}
          seeders={r.seeders}
        />
        <Table.Cell>
          {r.score != null ? (
            <Row self="flex-start" radius="pill" bg="accentWash/14" px={8} py={2}>
              <Text variant="meta" color="accentText" style={TABULAR}>
                {r.score}
              </Text>
            </Row>
          ) : (
            <Text variant="meta" color="textDim">
              —
            </Text>
          )}
        </Table.Cell>
        <Table.Cell>
          {canGrab && r.grabbable ? (
            <Table.Action
              tone={upgrade ? 'hdr' : 'accent'}
              icon={upgrade ? 'refresh' : 'download'}
              label={t(grabLabelKey(upgrade, rejected) as Parameters<typeof t>[0])}
              disabled={busy}
              onPress={() => onGrab(r)}
            />
          ) : null}
        </Table.Cell>
      </Table.Row>
      {open ? <ScoreBreakdown r={r} /> : null}
    </>
  );
}

function ScoreBreakdown({ r }: Readonly<{ r: ScoredReleaseView }>) {
  const t = useT();
  return (
    <Box px={16} pb={14} bg="surface1">
      <Divider color="tint/5" />
      {r.breakdown.length === 0 ? (
        <Text variant="meta" color="textDim" pt={10}>
          {r.rejected ?? t('requests.noBreakdown')}
        </Text>
      ) : (
        <Box gap={4} pt={10}>
          {r.breakdown.map((l) => (
            <Row key={`${l.rule}-${l.note}`} between gap={12}>
              <Text variant="meta" color="textDim" lines={1} minW={0}>
                {l.rule} · {l.note}
              </Text>
              <Text
                variant="meta"
                color={l.delta >= 0 ? 'success' : 'dangerHover'}
                shrink={0}
                style={TABULAR}
              >
                {l.delta >= 0 ? `+${l.delta}` : l.delta}
              </Text>
            </Row>
          ))}
        </Box>
      )}
    </Box>
  );
}
