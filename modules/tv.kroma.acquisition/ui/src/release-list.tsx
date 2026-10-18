import type { IndexerReport, ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, EmptyState, Text } from '@kromatv/ui/kit';
import { nothingAnswered } from './indexer-report';
import type { GrabActions } from './release-card';
import { autoPickOf, groupByEffect } from './release-effect';
import { ReleaseGroup } from './release-group';
import type { ReleaseTab, TabCounts } from './release-tab';

export function ReleaseList({
  tab,
  rows,
  counts,
  indexers,
  ...actions
}: Readonly<
  GrabActions & {
    tab: ReleaseTab;
    rows: readonly ScoredReleaseView[];
    counts: TabCounts;
    indexers: readonly IndexerReport[];
  }
>) {
  const t = useT();
  if (rows.length === 0) {
    const unsearched = nothingAnswered(indexers);
    return (
      <Box py={32}>
        <EmptyState.Root icon={unsearched ? 'alert-triangle' : 'search'}>
          <EmptyState.Title>{t(emptyKeyOf(tab, counts, unsearched))}</EmptyState.Title>
        </EmptyState.Root>
      </Box>
    );
  }
  if (tab === 'refused') {
    return (
      <Box gap={16}>
        {counts.accepted === 0 ? (
          <Text variant="meta" color="textMuted">
            {t('acq.noneAccepted')}
          </Text>
        ) : null}
        <ReleaseGroup effect={null} rows={rows} picked={null} {...actions} />
      </Box>
    );
  }
  const groups = groupByEffect(rows);
  const picked = autoPickOf(groups);
  return (
    <Box gap={28}>
      {groups.map((group) => (
        <ReleaseGroup
          key={group.effect}
          effect={group.effect}
          rows={group.rows}
          picked={picked}
          {...actions}
        />
      ))}
    </Box>
  );
}

function emptyKeyOf(tab: ReleaseTab, counts: TabCounts, unsearched: boolean): string {
  if (counts.all === 0) return unsearched ? 'requests.indexersAllFailed' : 'requests.noReleases';
  return tab === 'refused' ? 'acq.noneRefused' : 'acq.noneAccepted';
}
