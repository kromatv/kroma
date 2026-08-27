import { useT } from '@kroma/module-sdk';
import { Badge, Box, Button, Img, Row, Text } from '@kroma/ui/kit';
import type { MatchCandidateView } from './schemas';

const POSTER_WIDTH = 46;
const POSTER_HEIGHT = 69;

const CONFIDENT = 0.55;
const PLAUSIBLE = 0.35;

function toneFor(score: number): 'success' | 'info' | 'neutral' {
  if (score >= CONFIDENT) return 'success';
  if (score >= PLAUSIBLE) return 'info';
  return 'neutral';
}

interface CandidateRowProps {
  candidate: MatchCandidateView;
  current: boolean;
  busy: boolean;
  onPick: () => void;
}

export function CandidateRow({ candidate, current, busy, onPick }: Readonly<CandidateRowProps>) {
  const t = useT();
  return (
    <Row gap={12} p={8} radius="lg" bg={current ? 'tint/8' : 'transparent'}>
      <Box
        w={POSTER_WIDTH}
        h={POSTER_HEIGHT}
        shrink={0}
        center
        radius={4}
        overflow="hidden"
        bg="tint/5"
      >
        {candidate.posterUrl ? <Img src={candidate.posterUrl} fill /> : null}
      </Box>
      <Box flex minW={0} gap={2}>
        <Row gap={8} minW={0}>
          <Text variant="label" lines={1} shrink={1} minW={0}>
            {candidate.year ? `${candidate.title} (${candidate.year})` : candidate.title}
          </Text>
          <Badge tone={toneFor(candidate.score)}>{`${Math.round(candidate.score * 100)}%`}</Badge>
          {current ? <Badge tone="info">{t('downloads.linkCurrent')}</Badge> : null}
        </Row>
        {candidate.overview ? (
          <Text variant="meta" color="text/40" lines={2}>
            {candidate.overview}
          </Text>
        ) : null}
      </Box>
      <Button
        variant="glass"
        size="sm"
        label={t('downloads.linkPick')}
        onPress={onPick}
        disabled={busy}
      />
    </Row>
  );
}
