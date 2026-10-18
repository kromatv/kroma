import type { ScoredReleaseView } from '@kromatv/client/requests';
import { TABULAR, useT } from '@kromatv/module-sdk';
import { Box, Divider, Row, Text } from '@kromatv/ui/kit';
import { useRefusalText } from './refusal-text';
import { useScoreLineText } from './score-line-text';

const PANEL_W = 420;

export function ScoreBreakdown({ release }: Readonly<{ release: ScoredReleaseView }>) {
  const t = useT();
  const lineText = useScoreLineText();
  const refusalText = useRefusalText();
  const total = release.breakdown.reduce((sum, line) => sum + line.delta, 0);
  const lines = release.breakdown.filter((line) => line.delta !== 0 || line.rule === 'quality');
  if (release.breakdown.length === 0) {
    return (
      <Box px={16} pb={14} bg="surface1">
        <Divider color="tint/5" />
        <Text variant="meta" color="textDim" pt={10}>
          {refusalText(release.refusal, release.rejected) ?? t('requests.noBreakdown')}
        </Text>
      </Box>
    );
  }
  return (
    <Box px={16} pb={14} bg="surface1">
      <Divider color="tint/5" />
      <Box gap={4} pt={10} maxW={PANEL_W}>
        {lines.map((line) => (
          <Line
            key={`${line.rule}-${line.note}`}
            label={lineText(line)}
            delta={line.delta}
            tone={line.delta >= 0 ? 'success' : 'dangerHover'}
          />
        ))}
        <Divider color="tint/5" spacing={6} />
        <Line label={t('acq.scoreTotal')} delta={total} tone="text" />
      </Box>
    </Box>
  );
}

function Line({
  label,
  delta,
  tone,
}: Readonly<{ label: string; delta: number; tone: 'success' | 'dangerHover' | 'text' }>) {
  return (
    <Row between gap={12}>
      <Text variant="meta" color={tone === 'text' ? 'text' : 'textDim'} lines={1} minW={0}>
        {label}
      </Text>
      <Text variant="meta" color={tone} shrink={0} style={TABULAR}>
        {delta >= 0 ? `+${delta}` : delta}
      </Text>
    </Row>
  );
}
