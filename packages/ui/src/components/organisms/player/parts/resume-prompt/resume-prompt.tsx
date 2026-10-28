import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { RESUME_WINDOW } from '#ui/components/organisms/player/hooks/use-resume-notice';
import { GUTTER, scaler } from '#ui/components/organisms/player/lib/metrics';
import { CountdownCard } from '#ui/components/organisms/player/parts/countdown-card';
import { formatTimecode } from '#ui/lib/intl';
import { useFadeRise } from '#ui/lib/use-fade-rise';
import { useT } from '#ui/services/i18n';

export interface ResumePromptProps {
  /** The second playback opened on, drawn as the timecode it reads. */
  at: number;
  /** What is playing, under the timecode. */
  title?: string;
  /** Artwork for the card's picture; a tinted fill without it. */
  art?: string | null;
  /** False plays the prompt out, after which it draws nothing. */
  shown: boolean;
  /** Whole seconds before the prompt leaves on its own; null draws no ring. */
  secondsLeft?: number | null;
  /** The window `secondsLeft` drains against. Defaults to the one
   *  `useResumeNotice` counts. */
  total?: number;
  /** The remote moved to starting over: the viewer is deciding, so the
   *  countdown stops. */
  onHold?: () => void;
  /** The chrome's scale (see ../../lib/metrics). 1 on a television stage. */
  scale?: number;
  /** How high it sits above the bottom edge, in real pixels (already scaled). */
  lift: number;
  /** Keeps playing from `at` and puts the prompt away. */
  onResume: () => void;
  onStartOver: () => void;
}

/** The card that says a film opened where it was left, in the shape of the next
 * episode's: keep watching, or go back to the beginning. */
export function ResumePrompt({
  at,
  title,
  art,
  shown,
  secondsLeft = null,
  total = RESUME_WINDOW,
  onHold,
  scale = 1,
  lift,
  onResume,
  onStartOver,
}: Readonly<ResumePromptProps>) {
  const t = useT();
  const px = scaler(scale);
  const fade = useFadeRise(shown);
  if (!fade.mounted) return null;

  return (
    <Box
      absolute
      bottom={lift}
      left={px(GUTTER)}
      right={px(GUTTER)}
      align="flex-end"
      z={30}
      pointerEvents={shown ? 'box-none' : 'none'}
    >
      <Animated.View style={fade.style}>
        <CountdownCard
          art={art}
          eyebrow={t('player.resumedAt', { time: formatTimecode(at) })}
          title={title ?? ''}
          secondsLeft={secondsLeft}
          total={total}
          scale={scale}
          announce
          active={shown}
          secondary={{
            label: t('player.restart'),
            icon: 'rotate-clockwise-2',
            onPress: onStartOver,
            onFocus: onHold,
          }}
          primary={{
            label: t('player.resume'),
            icon: 'player-play-filled',
            onPress: onResume,
          }}
        />
      </Animated.View>
    </Box>
  );
}
