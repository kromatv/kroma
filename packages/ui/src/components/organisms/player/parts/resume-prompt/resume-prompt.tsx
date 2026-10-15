import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Frost } from '#ui/components/atoms/frost';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { useFadeRise } from '#ui/components/organisms/player/hooks/use-fade-rise';
import { RESUME_WINDOW } from '#ui/components/organisms/player/hooks/use-resume-notice';
import { GUTTER, scaler } from '#ui/components/organisms/player/lib/metrics';
import { scaledRadius, sharedStyle, styles, sv } from '#ui/core';
import { formatTimecode } from '#ui/lib/intl';
import { useT } from '#ui/services/i18n';

const LABEL_SIZE = 17;
const PLATE_WIDTH = 360;

// Pinned on the focused state too, because `primary` carries no border: unpinned,
// the button moved a pixel the moment focus landed on it (as the skip pill did).
const restartPill = sv({ base: { _focus: { border: 'accent' } } });

const sizeOf = (fontSize: number) => sharedStyle(`resume:size:${fontSize}`, { fontSize });

export interface ResumePromptProps {
  /** The second playback opened on, drawn as the timecode it reads. */
  at: number;
  /** False plays the prompt out, after which it draws nothing. */
  shown: boolean;
  /** Whole seconds before the prompt leaves on its own; null draws no rule. */
  secondsLeft?: number | null;
  /** The window `secondsLeft` drains against. Defaults to the one
   *  `useResumeNotice` counts. */
  total?: number;
  focused?: boolean;
  /** The chrome's scale (see ../../lib/metrics). 1 on a television stage. */
  scale?: number;
  /** How high it sits above the bottom edge, in real pixels (already scaled). */
  lift: number;
  onStartOver: () => void;
}

export function ResumePrompt({
  at,
  shown,
  secondsLeft = null,
  total = RESUME_WINDOW,
  focused = false,
  scale = 1,
  lift,
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
        <Frost>
          <Box
            w={px(PLATE_WIDTH)}
            maxW="100%"
            radius={scaledRadius('xl', scale)}
            overflow="hidden"
            accessibilityLiveRegion="polite"
            style={s.plate}
          >
            <Box px={px(18)} py={px(14)} gap={px(12)} align="flex-start">
              <Text variant="labelTv" style={sizeOf(px(LABEL_SIZE))}>
                {t('player.resumedAt', { time: formatTimecode(at) })}
              </Text>
              <Button
                variant={focused ? 'primary' : 'scrim'}
                size="sm"
                focused={focused}
                icon="rotate-clockwise-2"
                label={t('player.restart')}
                onPress={onStartOver}
                style={restartPill(undefined, { focus: focused }).root}
              />
            </Box>
            {secondsLeft == null ? null : (
              <Progress
                value={total > 0 ? secondsLeft / total : 0}
                thickness={2}
                rounded={false}
                trackColor="transparent"
              />
            )}
          </Box>
        </Frost>
      </Animated.View>
    </Box>
  );
}

const s = styles({ plate: { bg: 'tint/12', border: 'tint/20' } });
