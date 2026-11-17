import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Tooltip } from '@kromatv/ui/kit/molecules/tooltip';
import { STAGES } from '#site/lib/language';
import type { LocaleSummary, Stage } from '#site/lib/views';

const TONE = { draft: 'neutral', beta: 'warning', stable: 'success' } as const;

function StageBadge({ stage }: Readonly<{ stage: Stage }>) {
  return (
    <Tooltip label={STAGES[stage].hint}>
      <Badge tone={TONE[stage]}>{STAGES[stage].label}</Badge>
    </Tooltip>
  );
}

/** What sets a language apart in a list: the source, its stage, and whether the viewer started it. */
export function LanguageBadges({ locale }: Readonly<{ locale: LocaleSummary }>) {
  if (locale.isSource) {
    return (
      <Box>
        <Badge tone="info">Source</Badge>
      </Box>
    );
  }
  return (
    <>
      <StageBadge stage={locale.stage} />
      {locale.started ? (
        <Box>
          <Badge tone="info">Started by you</Badge>
        </Box>
      ) : null}
    </>
  );
}

/** What each stage means, written out once under a list of languages. */
export function StageLegend() {
  return (
    <Column gap={6}>
      {(['draft', 'beta', 'stable'] as const).map((stage) => (
        <Row key={stage} gap={8} align="center">
          <Box w={56} shrink={0}>
            <Badge tone={TONE[stage]}>{STAGES[stage].label}</Badge>
          </Box>
          <Box shrink={1} minW={0}>
            <Text variant="meta" color="textDim">
              {STAGES[stage].hint}
            </Text>
          </Box>
        </Row>
      ))}
    </Column>
  );
}
