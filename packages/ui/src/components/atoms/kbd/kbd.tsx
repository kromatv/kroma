import { useStyles } from '#ui/core/styles';
import { fontSizes as textSizes } from '#ui/core/tokens';
// <Kbd>: one keycap.
//
// The mark a shortcut is written with, in prose ("press Esc"), in a menu row,
// or under a search field. It is a face and never a control: pressing a picture
// of a key does nothing, and on a television it must not be a D-pad stop.

import type { ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';

const CAP = 22;
const GLYPH = 14;

interface KbdProps {
  /** The symbol on the key, for a key that has one: `command`, `arrow-up`,
   *  `corner-down-left`. Drawn rather than typed, since a symbol set as text sits on
   *  the baseline of whichever fallback font the platform picks. */
  icon?: IconName;
  /** The key as it is spelled on it: `esc`, `Ctrl`, `K`. */
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
}

/**
 * A keycap, as tall as every other and square when it holds one symbol, so a run of
 * them lines up.
 *
 * ```tsx
 * <Kbd icon="corner-down-left" />
 * <Kbd>esc</Kbd>
 * ```
 */
function Kbd({ icon, children, style }: Readonly<KbdProps>) {
  const s = useStyles(sDefinition);
  const spelled = typeof children === 'string' || typeof children === 'number';

  return (
    <Box
      row
      center
      gap={3}
      h={CAP}
      minW={CAP}
      px={children ? 6 : 0}
      radius="xs"
      bg="surface3"
      shrink={0}
      style={s.cap}
    >
      {icon ? <Icon name={icon} size={GLYPH} color="textMuted" /> : null}
      {spelled ? (
        <Text variant="meta" color="textMuted" style={[s.ink, style]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Box>
  );
}

const sDefinition = styles({
  cap: { border: 'border', borderBottomWidth: 2, borderBottomColor: 'borderStrong' },
  ink: { fontSize: textSizes.overlineRaised, fontWeight: '600', lineHeight: GLYPH },
});

export type { KbdProps };
export { Kbd };
