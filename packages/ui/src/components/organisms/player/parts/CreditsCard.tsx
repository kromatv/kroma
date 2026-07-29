import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Img } from '#ui/components/atoms/img';
import { clamp01 } from '#ui/components/atoms/progress';
import { ProgressRing } from '#ui/components/atoms/progress-ring';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { colors, fonts } from '#ui/lib/tokens';
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

/** The card's own width, at the design's scale. `maxW` keeps it on screen even
 * where the scale has bottomed out: 392 + its margin does not fit a phone-width
 * browser window, and a card that starts off the left edge takes its Play
 * button with it. */
const CARD_WIDTH = 392;

const ART_FILL = 'linear-gradient(135deg, rgba(244,182,66,0.16), rgba(20,18,22,0.96))';
const VIGNETTE = 'radial-gradient(120% 120% at 50% 25%, transparent, rgba(0,0,0,0.5))';

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
      border="rgba(255, 255, 255, 0.12)"
      bg="rgba(16, 16, 20, 0.9)"
      p={px(20)}
      style={CARD_SHADOW}
    >
      <Box h={px(150)} mb={px(16)} radius={px(14)} overflow="hidden">
        <Img src={item.posterUrl ?? null} background={ART_FILL} fill />
        <Box fill pointerEvents="none" style={gradient(VIGNETTE)} />
        <Box absolute left={px(14)} bottom={px(14)} w={ring} h={ring} center>
          <Box absolute>
            <ProgressRing
              value={progress}
              size={ring}
              stroke={px(6)}
              track="rgba(255, 255, 255, 0.14)"
              fill={colors.accent}
            />
          </Box>
          <Box w={px(42)} h={px(42)} center radius="pill" bg="#101014">
            <Txt style={[COUNTDOWN, { fontSize: px(COUNTDOWN_SIZE) }]}>{String(secondsLeft)}</Txt>
          </Box>
        </Box>
      </Box>
      <Txt style={EYEBROW} color="rgba(244, 243, 240, 0.5)">
        {t('player.nextEpisode')}
      </Txt>
      <Txt lines={1} style={TITLE}>
        {item.title}
      </Txt>
      {item.subtitle ? (
        <Txt style={SUBTITLE} color="accent">
          {item.subtitle}
        </Txt>
      ) : null}
      {/* Controlled kit buttons (`focused` is ALWAYS passed): neither may ever
          become a platform / navigator focus target - see ../lib/virtual-focus.ts.
          `playFocused` / `cancelFocused` drive the highlight; there is no hover
          handler here, exactly as before (the nav machine owns this card). */}
      <Box row gap={px(12)} mt={px(16)}>
        <Button
          variant="ghost"
          size="sm"
          focused={cancelFocused}
          focusedStyle={CANCEL_FOCUS}
          onPress={onCancel}
          label={t('player.cancel')}
        />
        <Button
          variant="primary"
          size="sm"
          icon="player-play-filled"
          focused={playFocused}
          focusedStyle={PLAY_FOCUS}
          onPress={onPlay}
          label={t('player.playNow')}
          style={GROW}
        />
      </Box>
    </Box>
  );
}

const GROW = { flex: 1 } as const;
/** The focused fills the card always had, on top of the kit's ring + scale. */
const CANCEL_FOCUS = { backgroundColor: 'rgba(255, 255, 255, 0.16)' } as const;
const PLAY_FOCUS = { backgroundColor: colors.accentHover } as const;

const CARD_SHADOW = { boxShadow: '0 26px 64px rgba(0, 0, 0, 0.62)' };

/** The countdown's size at the design's scale; the style carries the rest, so
 * the number is not written twice. */
const COUNTDOWN_SIZE = 19;
const COUNTDOWN = {
  fontFamily: fonts.ui,
  fontWeight: '700' as const,
  color: '#FFFFFF',
  fontVariant: ['tabular-nums' as const],
};

const EYEBROW = {
  fontFamily: fonts.ui,
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 1.76,
  textTransform: 'uppercase' as const,
};

const TITLE = {
  marginTop: 4,
  fontFamily: fonts.display,
  fontSize: 19,
  lineHeight: 23,
  fontWeight: '700' as const,
};

const SUBTITLE = { marginTop: 3, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' as const };
