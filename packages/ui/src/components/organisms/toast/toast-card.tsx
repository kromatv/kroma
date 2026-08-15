// One notice, drawn. The column it belongs to and the timer's length are the
// host's business (see toast.tsx); this file is the card and its motion.

import { useEffect, useEffectEvent, useState } from 'react';
import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type ColorToken, styles } from '#ui/core';
import { hasGlyph } from '#ui/lib/icons/glyphs';
import { WEB } from '#ui/lib/platform';
import type { ToastOptions } from './toast';

function ToastCard({
  entry,
  stay,
  from,
  onDone,
}: Readonly<{ entry: ToastOptions; stay: number; from: number; onDone: () => void }>) {
  const [appear] = useState(() => new Animated.Value(0));
  const done = useEffectEvent(onDone);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const leave = setTimeout(() => {
      Animated.timing(appear, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => done());
    }, stay);
    return () => clearTimeout(leave);
  }, [appear, stay]);

  return (
    <Animated.View
      style={{
        opacity: appear,
        transform: [
          {
            translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }),
          },
        ],
      }}
    >
      <Box row align="center" gap={14} px={20} py={16} radius="xl" style={s.card}>
        {entry.icon ? (
          // A NAMED glyph gets the kit's well; anything else (an avatar) is
          // already a finished round thing and is drawn as it comes.
          <Box
            w={40}
            h={40}
            center
            radius="circle"
            style={typeof entry.icon === 'string' ? s.well : undefined}
          >
            {typeof entry.icon === 'string' && hasGlyph(entry.icon) ? (
              <Icon name={entry.icon} size={22} thickness={1.9} color={wellTone(entry.tone)} />
            ) : (
              entry.icon
            )}
          </Box>
        ) : null}
        <Box style={s.text}>
          <Text lines={1} style={s.message}>
            {entry.message}
          </Text>
          {entry.detail ? (
            <Text lines={1} style={s.detail} color="textMuted">
              {entry.detail}
            </Text>
          ) : null}
        </Box>
      </Box>
    </Animated.View>
  );
}

function wellTone(tone: ToastOptions['tone']): ColorToken {
  if (tone === 'success') return 'success';
  if (tone === 'accent') return 'accent';
  return 'text';
}

const s = styles({
  card: {
    bg: 'overlay',
    border: 'border',
    radius: 'xl',
    maxW: 520,
    // The lift that separates a notice from the picture behind it. Web-only: the
    // native shadow props cost a rasterisation pass a TV does not need to spend.
    ...(WEB ? { boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)' } : null),
  },
  well: { bg: 'tint/8' },
  text: { minW: 0, shrink: 1 },
  message: { font: 'ui', fontSize: 17, fontWeight: '600' },
  detail: { font: 'ui', fontSize: 14, mt: 2 },
});

export { ToastCard };
