import type { ReleaseVerdict } from '@kromatv/client/requests';
import { TABULAR, useT } from '@kromatv/module-sdk';
import { Badge, Box, Row, Text } from '@kromatv/ui/kit';
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

/** The formats a release matched that the profile puts a score on. A format
 *  worth nothing is left out: it adds a line and says nothing. */
export function FormatPills({
  formats,
}: Readonly<{ formats: readonly { name: string; score: number }[] }>) {
  const scored = scoredFirst(formats).filter((format) => format.score !== 0);
  if (scored.length === 0) return null;
  return (
    <Row wrap gapX={6} gapY={4}>
      {scored.map((format) => (
        <Row key={format.name} radius="pill" bg="tint/8" px={7} py={1} gap={4}>
          <Text variant="meta" color="text">
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

/** What a tracker's volume factors say about a release, as small badges. */
export function FlagBadges({ flags }: Readonly<{ flags: readonly string[] }>) {
  const t = useT();
  if (flags.length === 0) return null;
  return (
    <Row wrap gapX={6} gapY={4}>
      {flags.map((flag) => (
        <Badge key={flag} tone="success">
          {t(`acq.flag.${flag}`)}
        </Badge>
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

/** A release's or a file's total, painted by its sign: a zero is not a win. */
export function ScorePill({ score }: Readonly<{ score: number }>) {
  const paint = SCORE_PAINT[Math.sign(score) as -1 | 0 | 1];
  return (
    <Box self="flex-start" radius="pill" bg={paint.bg} px={8} py={2}>
      <Text variant="meta" color={paint.ink} style={TABULAR}>
        {signed(score)}
      </Text>
    </Box>
  );
}

const SCORE_PAINT = {
  [-1]: { bg: 'danger/12', ink: 'dangerHover' },
  0: { bg: 'tint/6', ink: 'textDim' },
  1: { bg: 'accentWash/14', ink: 'accentText' },
} as const;

function signed(score: number): string {
  return score >= 0 ? `+${score}` : String(score);
}

function scoreColor(score: number): 'success' | 'dangerHover' | 'textDim' {
  if (score > 0) return 'success';
  return score < 0 ? 'dangerHover' : 'textDim';
}
