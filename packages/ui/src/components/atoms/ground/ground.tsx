import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { WEB } from '#ui/lib/platform';

export interface GroundProps {
  /** The ground this subtree paints on, whatever the page around it chose. */
  tone: 'dark' | 'light';
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * Pins a subtree to one ground, for chrome painting over artwork: the player is
 * dark on a page that is light.
 *
 * On a browser it is a true scope, one attribute redefining the properties for
 * everything inside it. ON NATIVE IT DOES NOTHING: there is no cascade, and the
 * theme store is one switch for the whole app. A native surface that must hold
 * one ground spells its own inks instead.
 */
export function Ground({ tone, flex, style, children }: Readonly<GroundProps>) {
  return (
    <Box flex={flex} style={style} dataSet={WEB ? { theme: tone } : undefined}>
      {children}
    </Box>
  );
}
