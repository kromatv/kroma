import type { ReleaseVerdict } from '@kromatv/client/requests';
import { TABULAR, useT } from '@kromatv/module-sdk';
import { Box, Row, Text } from '@kromatv/ui/kit';
import { scoredFirst } from './matched-formats';
import { verdictLabelKey, verdictReasonKey, verdictTone } from './release-verdict';
import { useQualityLabel } from './use-quality-label';

export function QualityPill({
  quality,
  allowed = true,
}: Readonly<{
  quality: string;
  allowed?: boolean;
}>) {
  const label = useQualityLabel();
  return (
    <Row
      self="flex-start"
      radius="pill"
      bg={allowed ? 'tint/8' : 'danger/10'}
      px={8}
      py={2}
      shrink={0}
    >
      <Text variant="meta" color={allowed ? 'text' : 'dangerHover'} lines={1}>
        {label(quality)}
      </Text>
    </Row>
  );
}

export function FormatPills({
  formats,
}: Readonly<{ formats: readonly { name: string; score: number }[] }>) {
  if (formats.length === 0) return null;
  return (
    <Row wrap gapX={6} gapY={4}>
      {scoredFirst(formats).map((format) =>
        format.score === 0 ? (
          <Box key={format.name} radius="pill" px={7} py={1}>
            <Text variant="meta" color="textDim">
              {format.name}
            </Text>
          </Box>
        ) : (
          <Row key={format.name} radius="pill" bg="tint/8" px={7} py={1} gap={4}>
            <Text variant="meta" color="text">
              {format.name}
            </Text>
            <Text variant="meta" color={scoreColor(format.score)} style={TABULAR}>
              {signed(format.score)}
            </Text>
          </Row>
        ),
      )}
    </Row>
  );
}

export function VerdictLine({ verdict }: Readonly<{ verdict: ReleaseVerdict }>) {
  const t = useT();
  const reason = verdictReasonKey(verdict);
  return (
    <Row wrap gapX={6} align="center">
      <Text variant="meta" color={verdictTone(verdict)}>
        {t(verdictLabelKey(verdict))}
      </Text>
      {reason ? (
        <Text variant="meta" color="textDim" lines={1}>
          {t(reason)}
        </Text>
      ) : null}
    </Row>
  );
}

export function ScorePill({ score }: Readonly<{ score: number }>) {
  return (
    <Box self="flex-start" radius="pill" bg="accentWash/14" px={8} py={2}>
      <Text variant="meta" color="accentText" style={TABULAR}>
        {signed(score)}
      </Text>
    </Box>
  );
}

function signed(score: number): string {
  return score >= 0 ? `+${score}` : String(score);
}

function scoreColor(score: number): 'success' | 'dangerHover' | 'textDim' {
  if (score > 0) return 'success';
  return score < 0 ? 'dangerHover' : 'textDim';
}
