// <Kbd>: one keycap.
//
// The mark a shortcut is written with, in prose ("press Esc"), in a menu row,
// or under a search field. It is a face and never a control: pressing a picture
// of a key does nothing, and on a television it must not be a D-pad stop.

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';

interface KbdProps {
  /** The key as it is printed on it: `esc`, `⌘`, `Ctrl`, `↵`. */
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

/**
 * A keycap.
 *
 * ```tsx
 * <Kbd>esc</Kbd>
 * <Kbd>⌘ K</Kbd>
 * ```
 */
function Kbd({ children, style }: Readonly<KbdProps>) {
  return (
    <Box px={6} py={2} radius={6} bg="surface3" shrink={0} style={s.cap}>
      <Text variant="meta" color="textMuted" style={[s.ink, style]}>
        {children}
      </Text>
    </Box>
  );
}

const s = styles({
  cap: { border: 'border', shadow: 'card' },
  // The kit's mono is a system stack rather than a served family, so a keycap
  // is the platform's own monospace wherever it is drawn.
  ink: { font: 'mono', fontSize: 10.5, lineHeight: 14 },
});

export type { KbdProps };
export { Kbd };
