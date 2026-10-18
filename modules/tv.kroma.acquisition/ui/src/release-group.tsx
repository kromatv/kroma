import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { type GrabActions, ReleaseCard } from './release-card';
import { EFFECT_DOT, EFFECT_GROUP, type Effect } from './release-effect';
import { FIRST_PAGE, pageOf } from './release-page';

export function ReleaseGroup({
  effect,
  rows,
  picked,
  ...actions
}: Readonly<
  GrabActions & {
    effect: Effect | null;
    rows: readonly ScoredReleaseView[];
    picked: ScoredReleaseView | null;
  }
>) {
  const t = useT();
  const [shown, setShown] = useState(FIRST_PAGE);
  const page = pageOf(rows, shown);
  return (
    <Box gap={12}>
      {effect ? <GroupHeading effect={effect} count={rows.length} /> : null}
      <Box gap={8}>
        {page.visible.map((release) => (
          <ReleaseCard
            key={`${release.indexerId}-${release.guid}`}
            release={release}
            picked={release === picked}
            {...actions}
          />
        ))}
      </Box>
      {page.next > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          block
          icon="chevron-down"
          label={t(page.next === page.rest ? 'acq.showRest' : 'acq.showMore', {
            count: page.next,
            rest: page.rest,
          })}
          onPress={() => setShown(shown + page.next)}
        />
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
