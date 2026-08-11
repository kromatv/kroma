// One TMDB candidate in the rematch grid: its poster, the matcher's confidence
// in it, and whether it is the match the element is pinned to today.

import type { MatchCandidate } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  backdropBlur,
  type ColorValue,
  color,
  Focusable,
  Spinner,
  sv,
  Text,
} from '@kroma/ui/kit';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import { Image } from '#web/shared/ui';

const FROST = backdropBlur(4);

const candidateCard = sv({
  base: {
    overflow: 'hidden',
    radius: 'xl',
    border: 'white/8',
    bg: 'surface1',
    _hover: { border: 'white/20', bg: 'surface2' },
    _disabled: { opacity: 0.6 },
  },
  variants: {
    current: {
      true: {
        border: 'accent/50',
        bg: 'accent/8',
        _hover: { border: 'accent/50', bg: 'accent/8' },
      },
      false: {},
    },
  },
  defaults: { current: false },
});

export interface CandidateCardProps {
  candidate: MatchCandidate;
  /** This candidate is the one being applied. */
  busy: boolean;
  /** Any candidate is being applied, so none may be picked. */
  disabled: boolean;
  onPick: () => void;
}

/** One pickable candidate. */
export function CandidateCard({ candidate, busy, disabled, onPick }: Readonly<CandidateCardProps>) {
  const t = useT();
  const { title, originalTitle, year, posterUrl, overview, score, current, tmdbId } = candidate;
  // The original title only earns its line when it differs from the localized one.
  const subtitle = originalTitle && originalTitle !== title ? originalTitle : null;
  return (
    <Focusable
      sv={candidateCard}
      vars={{ current }}
      disabled={disabled}
      label={title}
      onPress={onPick}
    >
      {({ hovered }) => (
        <>
          <Box w="100%" aspect={2 / 3} bg="white/5">
            {posterUrl ? (
              <Image src={posterUrl} fit="cover" fill />
            ) : (
              <Box fill center>
                <IconSearch size={26} stroke={1.6} color={color('white/15')} />
              </Box>
            )}
            <Box absolute left={6} top={6}>
              <Confidence score={score} />
            </Box>
            {current ? (
              <Box absolute right={6} top={6} radius="pill" bg="accent" px={8} py={2}>
                <Text variant="overline" color="black">
                  {t('rematch.current')}
                </Text>
              </Box>
            ) : null}
            {busy ? (
              <Box fill center bg="black/50">
                <Spinner size={22} color="white" />
              </Box>
            ) : null}
            {!busy && current && hovered ? (
              <Box fill center bg="black/40">
                <IconCheck size={26} stroke={2.4} color={color('accent')} />
              </Box>
            ) : null}
          </Box>
          <Box flex minH={0} gap={4} p={10}>
            <Box row align="baseline" gap={6}>
              <Text variant="label" lines={1}>
                {title}
              </Text>
              {year != null ? (
                <Text variant="meta" color="white/45">
                  {year}
                </Text>
              ) : null}
            </Box>
            {subtitle ? (
              <Text variant="meta" color="white/40" lines={1}>
                {subtitle}
              </Text>
            ) : null}
            {overview ? (
              <Text variant="meta" color="white/35" lines={2}>
                {overview}
              </Text>
            ) : null}
            <Text variant="overline" color="white/25" mt="auto" pt={4}>
              {`#${tmdbId}`}
            </Text>
          </Box>
        </>
      )}
    </Focusable>
  );
}

function Confidence({ score }: Readonly<{ score: number }>) {
  const t = useT();
  const pct = Math.round(score * 100);
  let tone: { bg: ColorValue; ink: ColorValue } = { bg: 'black/70', ink: 'white/60' };
  if (pct >= 70) tone = { bg: 'success/85', ink: 'black' };
  else if (pct >= 35) tone = { bg: 'accent/85', ink: 'black' };
  return (
    <Box radius="pill" px={8} py={2} bg={tone.bg} style={FROST}>
      <Text variant="overline" color={tone.ink}>
        {t('rematch.confidence', { score: pct })}
      </Text>
    </Box>
  );
}
