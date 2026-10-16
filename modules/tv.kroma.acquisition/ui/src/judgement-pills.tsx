import type { ReleaseVerdict } from '@kromatv/client/requests';
import { TABULAR, useT } from '@kromatv/module-sdk';
import { Box, Row, Text } from '@kromatv/ui/kit';
import { verdictLabelKey, verdictReasonKey, verdictTone } from './release-verdict';

export function QualityPill({
  quality,
  allowed = true,
}: Readonly<{
  quality: string;
  allowed?: boolean;
}>) {
  return (
    <Row
      self="flex-start"
      radius="pill"
      bg={allowed ? 'tint/8' : 'danger/10'}
      px={8}
      py={2}
      shrink={0}
    >
      <Text variant="meta" color={allowed ? 'text' : 'dangerHover'}>
        {quality}
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
      {formats.map((format) => (
        <Row key={format.name} radius="pill" bg="tint/6" px={7} py={1} gap={4}>
          <Text variant="meta" color="textDim">
            {format.name}
          </Text>
          <Text variant="meta" color={scoreColor(format.score)} style={TABULAR}>
            {signed(format.score)}
          </Text>
        </Row>
      ))}
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
