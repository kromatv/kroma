import type { IndexerReport, ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Disclosure, EmptyState, Row, Text } from '@kromatv/ui/kit';
import { nothingAnswered } from './indexer-report';
import { ReleaseCard } from './release-card';
import { autoPickOf, EFFECT_DOT, EFFECT_GROUP, type Effect, groupByEffect } from './release-effect';

interface CardActions {
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}

export function ReleaseList({
  rows,
  indexers,
  ...actions
}: Readonly<
  CardActions & {
    rows: readonly ScoredReleaseView[];
    indexers: readonly IndexerReport[];
  }
>) {
  const t = useT();
  if (rows.length === 0) {
    const unsearched = nothingAnswered(indexers);
    return (
      <Box py={32}>
        <EmptyState.Root icon={unsearched ? 'alert-triangle' : 'search'}>
          <EmptyState.Title>
            {t(unsearched ? 'requests.indexersAllFailed' : 'requests.noReleases')}
          </EmptyState.Title>
        </EmptyState.Root>
      </Box>
    );
  }
  const groups = groupByEffect(rows);
  const picked = autoPickOf(groups);
  const kept = groups.filter((group) => group.effect !== 'refused');
  const refused = groups.find((group) => group.effect === 'refused');
  const cards = (list: readonly ScoredReleaseView[]) => (
    <Box gap={8}>
      {list.map((release) => (
        <ReleaseCard
          key={`${release.indexerId}-${release.guid}`}
          release={release}
          picked={release === picked}
          {...actions}
        />
      ))}
    </Box>
  );
  return (
    <Box gap={28}>
      {kept.map((group) => (
        <Box key={group.effect} gap={12}>
          <GroupHeading effect={group.effect} count={group.rows.length} />
          {cards(group.rows)}
        </Box>
      ))}
      {refused ? (
        <Disclosure.Root defaultOpen={kept.length === 0}>
          <Disclosure.Trigger>
            {t(EFFECT_GROUP.refused, { count: refused.rows.length })}
          </Disclosure.Trigger>
          <Disclosure.Panel>{cards(refused.rows)}</Disclosure.Panel>
        </Disclosure.Root>
      ) : null}
    </Box>
  );
}

function GroupHeading({ effect, count }: Readonly<{ effect: Effect; count: number }>) {
  const t = useT();
  return (
    <Row gap={8} align="center">
      <Box w={8} h={8} radius="pill" bg={EFFECT_DOT[effect]} />
      <Text variant="overline" color="textMuted" accessibilityRole="header">
        {t(EFFECT_GROUP[effect], { count })}
      </Text>
    </Row>
  );
}
