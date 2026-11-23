import { type ReactNode, useLayoutEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { type FocusRingPart, useFocusRingPart } from '#ui/lib/focus-ring-part';
import { useFocusRing } from './focusable-paint';

interface FocusRingProps {
  /** Draw the ring while this is true as well as under keyboard focus: a tile
   *  that rings its artwork under the pointer too. */
  lit?: boolean;
  /** Render onto the one child instead of adding a view, the way <Box asChild>
   *  does. */
  asChild?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const release = () => undefined;

const UNOWNED: FocusRingPart = { visible: false, token: null, claim: () => release };

/**
 * Moves the enclosing <Focusable>'s ring onto this part: the artwork of a tile
 * rather than the artwork and its caption. Same ring, same placement, same
 * theme colour; the control stops drawing its own while one is mounted.
 */
function FocusRing({ lit = false, asChild, style, children }: Readonly<FocusRingProps>) {
  const { visible, token, claim } = useFocusRingPart() ?? UNOWNED;
  useLayoutEffect(() => claim(), [claim]);
  const ring = useFocusRing(token ?? 'focusLift');
  const on = token !== null && (lit || visible);
  return (
    <Box asChild={asChild} collapsable={false} style={[style, on ? ring : null]}>
      {children}
    </Box>
  );
}

export type { FocusRingProps };
export { FocusRing };
