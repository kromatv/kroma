// One TMDB candidate in the rematch grid, drawn to a fixed box so a card with
// three lines of plot and a card with none stay comparable.

import { type MatchCandidate, posterColors } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Focusable, Icon, Progress, Spinner, sv, Text, tintGradient } from '@kroma/ui/kit';
import { confidencePercent, confidenceTone } from '#web/features/catalog/rematch-ranking';
import { Image } from '#web/shared/ui';

const candidateCard = sv({
  base: {
    // A <button> shrink-to-fits: without this the card is as wide as its own
    // longest word rather than as wide as the grid cell it sits in.
    w: '100%',
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

const POSTER_ASPECT = 2 / 3;
// The clamped runs keep their space whether or not TMDB filled them, so every
// card in the grid is the same height.
const META_H = 20;
const OVERVIEW_H = 40;
const PERCENT_W = 44;

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
  // The original title only earns its place when it differs from the localized one.
  const subtitle = originalTitle && originalTitle !== title ? originalTitle : null;
  const meta = [year, subtitle, t('rematch.tmdbId', { id: tmdbId })].filter(Boolean).join(' · ');
  const percent = confidencePercent(score);
  const tone = confidenceTone(score);
  return (
    <Focusable
      sv={candidateCard}
      vars={{ current }}
      disabled={disabled}
      busy={busy}
      label={title}
      onPress={onPick}
    >
      <Box w="100%" aspect={POSTER_ASPECT} bg="surface2">
        <Image
          src={posterUrl ?? null}
          fit="cover"
          fill
          background={tintGradient(posterColors(String(tmdbId)))}
          fallback={
            <Box fill center>
              <Icon name="photo" size={26} color="glyphDim" />
            </Box>
          }
        />
        {current ? (
          <Box
            absolute
            left={8}
            top={8}
            row
            align="center"
            gap={4}
            radius="pill"
            bg="accent"
            px={8}
          >
            <Icon name="check" size={12} color="accentInk" thickness={2.6} />
            <Text variant="overline" color="accentInk" py={4}>
              {t('rematch.current')}
            </Text>
          </Box>
        ) : null}
        {busy ? (
          <Box fill center bg="black/55">
            <Spinner size={22} color="white" />
          </Box>
        ) : null}
      </Box>
      <Box gap={4} px={12} pt={10} pb={12}>
        <Text variant="label" lines={1}>
          {title}
        </Text>
        <Text variant="meta" color="textMuted" lines={1} minH={META_H}>
          {meta}
        </Text>
        <Box minH={OVERVIEW_H}>
          {overview ? (
            <Text variant="meta" color="textDim" lines={2}>
              {overview}
            </Text>
          ) : null}
        </Box>
        <Box row align="center" gap={8} pt={6}>
          <Box flex>
            <Progress
              value={score}
              thickness={4}
              rounded
              color={tone}
              trackColor="white/12"
              label={t('rematch.confidence', { score: percent })}
            />
          </Box>
          <Text variant="overline" color={tone} w={PERCENT_W} textAlign="right" lines={1}>
            {t('rematch.confidenceValue', { score: percent })}
          </Text>
        </Box>
      </Box>
    </Focusable>
  );
}
