import type { ScoredReleaseView } from '@kromatv/client/requests';
import { Box, Divider, Focusable, Row, sv, Text, useBreakpoint } from '@kromatv/ui/kit';
import { type ReactNode, useState } from 'react';
import { GrabButton } from './grab-button';
import { ScorePill } from './judgement-pills';
import { ScoreBreakdown } from './release-breakdown';
import { ReleaseFacts } from './release-facts';
import { ReleaseMeta } from './release-meta';
import { ReleaseNumbers } from './release-numbers';

const SCORE_W = 64;
const BUTTON_W = 128;
const TRAIL_W = SCORE_W + 16 + BUTTON_W;

const hit = sv({
  base: { fill: true, _hover: { bg: 'tint/4' } },
});

export function ReleaseCard({
  release,
  picked,
  canGrab,
  busy,
  onGrab,
}: Readonly<{
  release: ScoredReleaseView;
  picked: boolean;
  canGrab: boolean;
  busy: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const [open, setOpen] = useState(false);
  const narrow = useBreakpoint() === 'base';
  const button =
    canGrab && release.grabbable ? (
      <GrabButton release={release} picked={picked} busy={busy} block onGrab={onGrab} />
    ) : null;
  const score = release.score == null ? null : <ScorePill score={release.score} />;
  const lines = (
    <Box flex={!narrow} minW={0} gap={6} pointerEvents="none">
      <ReleaseFacts release={release} />
      <Text variant="meta" font="mono" color="textDim" lines={open ? undefined : 1}>
        {release.title}
      </Text>
      <ReleaseMeta release={release} />
    </Box>
  );
  return (
    <Box radius="lg" border={borderOf(open, picked)} bg="tint/3" overflow="hidden">
      <Box>
        <Focusable
          sv={hit}
          label={release.title}
          expanded={open}
          ring="focusInset"
          onPress={() => setOpen((was) => !was)}
        />
        {narrow ? (
          <Box pointerEvents="box-none" p={14} gap={12}>
            {lines}
            <Row gap={16} align="center" pointerEvents="none">
              <ReleaseNumbers release={release} aligned={false} />
              {score}
            </Row>
            {button}
          </Box>
        ) : (
          <Row pointerEvents="box-none" px={18} py={14} gap={24} align="center">
            {lines}
            <ReleaseNumbers release={release} aligned />
            <Trail score={score} button={button} />
          </Row>
        )}
      </Box>
      {open ? (
        <>
          <Divider spacing={0} />
          <ScoreBreakdown release={release} />
        </>
      ) : null}
    </Box>
  );
}

function Trail({ score, button }: Readonly<{ score: ReactNode; button: ReactNode }>) {
  return (
    <Row w={TRAIL_W} justify="flex-end" align="center" gap={16} pointerEvents="box-none">
      {score ? (
        <Row w={SCORE_W} justify="flex-end" pointerEvents="none">
          {score}
        </Row>
      ) : null}
      {button ? <Box minW={BUTTON_W}>{button}</Box> : null}
    </Row>
  );
}

function borderOf(open: boolean, picked: boolean): 'borderStrong' | 'accent/40' | 'border' {
  if (picked) return 'accent/40';
  return open ? 'borderStrong' : 'border';
}
