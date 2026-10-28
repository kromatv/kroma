import { Box } from '#ui/components/atoms/box';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import { CountdownCard } from '#ui/components/organisms/player/parts/countdown-card';
import { useT } from '#ui/services/i18n';

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
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  onPlay: () => void;
  onCancel: () => void;
}

/**
 * Credits autoplay card (§11): a bottom-right card that surfaces during the
 * closing credits with the next episode, a draining amber countdown ring around
 * the seconds-left number, and a cancel escape.
 */
export function CreditsCard({
  item,
  secondsLeft,
  total,
  scale = 1,
  onPlay,
  onCancel,
}: Readonly<CreditsCardProps>) {
  const t = useT();
  const px = scaler(scale);
  return (
    <Box absolute right={px(40)} bottom={px(56)} z={38} maxW="100%">
      <CountdownCard
        art={item.posterUrl}
        eyebrow={t('player.nextEpisode')}
        title={item.title}
        subtitle={item.subtitle}
        secondsLeft={secondsLeft}
        total={total}
        scale={scale}
        secondary={{ label: t('player.cancel'), onPress: onCancel }}
        primary={{
          label: t('player.playNow'),
          icon: 'player-play-filled',
          onPress: onPlay,
        }}
      />
    </Box>
  );
}
