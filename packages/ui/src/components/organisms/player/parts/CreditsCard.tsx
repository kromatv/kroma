import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Img } from '#ui/components/atoms/img';
import { clamp01 } from '#ui/components/atoms/progress';
import { ProgressRing } from '#ui/components/atoms/progress-ring';
import { Txt } from '#ui/components/atoms/text';
import { styles, sv, useTheme } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';
import { scaler } from '../lib/metrics';

/**
 * Minimal shape the credits card needs from the up-next item. Declared locally
 * (rather than importing `UpNextItem`) so this file never hard-depends on the
 * sheet module's build order; the orchestrator passes a compatible object.
 */
export interface CreditsCardItem {
  title: string;
  /** The "kind" line under the title (e.g. "S1 E4" or a genre). */
  subtitle?: string;
  posterUrl?: string | null;
}

export interface CreditsCardProps {
  item: CreditsCardItem;
  /** Remaining whole seconds before autoplay (e.g. 5..0). */
  secondsLeft: number;
  /** Countdown length the ring drains against (e.g. 5). */
  total: number;
  playFocused: boolean;
  cancelFocused: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  onPlay: () => void;
  onCancel: () => void;
}

// `maxW` (used below) keeps the card on screen at the design width: 392 + its
// margin doesn't fit a phone browser, and an off-screen card takes Play with it.
const CARD_WIDTH = 392;

const ART_FILL = 'linear-gradient(135deg, rgba(244,182,66,0.16), rgba(20,18,22,0.96))';
const VIGNETTE = 'radial-gradient(120% 120% at 50% 25%, transparent, rgba(0,0,0,0.5))';

const cancelFill = sv({ base: { _focus: { bg: 'white/16' } } });
const playFill = sv({ base: { flex: 1, _focus: { bg: 'accentHover' } } });

/**
 * Credits autoplay card (§11): a bottom-right card that surfaces during the
 * closing credits with the next episode, a draining amber countdown ring around
 * the seconds-left number, and a cancel escape.
 *
 * The ring is the shared <ProgressRing> rather than the design's conic-gradient:
 * a conic gradient is CSS-only, and an SVG arc is the same picture on every
 * platform.
 */
export function CreditsCard({
  item,
  secondsLeft,
  total,
  playFocused,
  cancelFocused,
  scale = 1,
  onPlay,
  onCancel,
}: Readonly<CreditsCardProps>) {
  const t = useT();
  const theme = useTheme();
  const px = scaler(scale);
  const progress = total > 0 ? clamp01(secondsLeft / total) : 0;
  const ring = px(54);
  return (
    <Box
      absolute
      right={px(40)}
      bottom={px(56)}
      z={38}
      w={px(CARD_WIDTH)}
      maxW="100%"
      radius={px(20)}
      borderWidth={1}
      border="white/12"
      bg="rgba(16, 16, 20, 0.9)"
      p={px(20)}
      style={s.cardShadow}
    >
      <Box h={px(150)} mb={px(16)} radius={px(14)} overflow="hidden">
        <Img src={item.posterUrl ?? null} background={ART_FILL} fill />
        <Box fill style={[s.vignette, gradient(VIGNETTE)]} />
        <Box absolute left={px(14)} bottom={px(14)} w={ring} h={ring} center>
          <Box absolute>
            <ProgressRing
              value={progress}
              size={ring}
              stroke={px(6)}
              track="rgba(255, 255, 255, 0.14)"
              fill={theme.colors.accent}
            />
          </Box>
          <Box w={px(42)} h={px(42)} center radius="pill" bg="#101014">
            <Txt style={[s.countdown, { fontSize: px(COUNTDOWN_SIZE) }]}>{String(secondsLeft)}</Txt>
          </Box>
        </Box>
      </Box>
      <Txt style={s.eyebrow} color="text/50">
        {t('player.nextEpisode')}
      </Txt>
      <Txt lines={1} style={s.title}>
        {item.title}
      </Txt>
      {item.subtitle ? (
        <Txt style={s.subtitle} color="accent">
          {item.subtitle}
        </Txt>
      ) : null}
      {/* Controlled kit buttons (`focused` is ALWAYS passed) so neither becomes a
          platform focus target — see ../lib/virtual-focus.ts. No hover handler:
          the nav machine owns this card's focus. */}
      <Box row gap={px(12)} mt={px(16)}>
        <Button
          variant="ghost"
          size="sm"
          focused={cancelFocused}
          style={cancelFill(undefined, { focus: cancelFocused }).root}
          onPress={onCancel}
          label={t('player.cancel')}
        />
        <Button
          variant="primary"
          size="sm"
          icon="player-play-filled"
          focused={playFocused}
          onPress={onPlay}
          label={t('player.playNow')}
          style={playFill(undefined, { focus: playFocused }).root}
        />
      </Box>
    </Box>
  );
}

const COUNTDOWN_SIZE = 19;

const s = styles({
  cardShadow: { boxShadow: '0 26px 64px rgba(0, 0, 0, 0.62)' },
  vignette: { pointerEvents: 'none' },
  countdown: {
    font: 'ui',
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
  },
  eyebrow: {
    font: 'ui',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  title: { mt: 4, font: 'display', fontSize: 19, lineHeight: 23, fontWeight: '700' },
  subtitle: { mt: 3, font: 'ui', fontSize: 13, fontWeight: '600' },
});
