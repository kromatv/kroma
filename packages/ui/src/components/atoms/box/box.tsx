// <Box>: the layout primitive.
//
// A React Native <View> that takes the design's vocabulary directly, so a screen
// reads as layout instead of as a StyleSheet lookup table:
//
//   <Box row center gap={12} px={64} py={24} bg="surface1" radius="lg" flex>
//
// `style` is still there and always wins, for the genuinely one-off cases.

import type { ReactNode, Ref } from 'react';
import { type StyleProp, View, type ViewProps, type ViewStyle } from 'react-native';
import { BOX_STYLE_PROPS, type BoxStyleProps, styles } from '#ui/core';
import { sharedBoxStyle } from '#ui/lib/box-style';

interface BoxProps extends BoxStyleProps, Omit<ViewProps, 'style'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Forwarded to the underlying host view. React 19 takes `ref` as a plain
   *  prop, so no forwardRef wrapper is needed; it is declared explicitly because
   *  ViewProps does not carry it. */
  ref?: Ref<View>;
}

function Box({ children, style, ref, ...props }: Readonly<BoxProps>) {
  const { view, layout } = splitProps(props);
  return (
    <View {...view} ref={ref} style={[layout, style]}>
      {children}
    </View>
  );
}

/** Horizontal <Box>. Sugar for the single most common case, and it reads better
 * at a call site than `row` buried among a dozen other props. */
function Row({ children, ...props }: Readonly<BoxProps>) {
  return (
    <Box row align="center" {...props}>
      {children}
    </Box>
  );
}

/** Vertical <Box>. React Native already stacks in a column, so this exists for
 * symmetry with <Row> and to make intent explicit at the call site. */
function Column({ children, ...props }: Readonly<BoxProps>) {
  return <Box {...props}>{children}</Box>;
}

/** Pushes whatever follows it to the far end of a <Row>. */
function Spacer() {
  return <View style={s.spacer} />;
}

const s = styles({ spacer: { flex: true } });

// Every style shorthand <Box> owns. Anything else is a real View prop and is
// forwarded untouched (onLayout, pointerEvents, testID, accessibility...). The
// list lives with the resolver so `sv`'s `style()` reads the same one.
const STYLE_PROPS = BOX_STYLE_PROPS;

// Splits the shorthand props from the real View props, and resolves the first
// into one style object shared by identity between every box asking for the
// same thing (see `sharedBoxStyle`). The cache key is built during the split
// rather than from the finished style, since the key is thrown away on a hit
// (the common case), which is cheaper than resolving the style and hashing it.
// Sorting the handful of parts canonicalises the caller's prop order, so `row
// gap={4}` and `gap={4} row` are one cache entry rather than two — and costs
// less than a second pass over the whole vocabulary.
function splitProps(props: Record<string, unknown>): {
  view: Record<string, unknown>;
  layout: ViewStyle;
} {
  const style: Record<string, unknown> = {};
  const view: Record<string, unknown> = {};
  const parts: string[] = [];
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (!STYLE_PROPS.has(key)) {
      view[key] = value;
      continue;
    }
    style[key] = value;
    if (value === undefined) continue;
    // A transform is an array of objects; everything else is a primitive. The
    // primitive side is named explicitly so String() never meets an object.
    const primitive =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    parts.push(`${key}:${primitive ? String(value) : JSON.stringify(value)}`);
  }
  if (parts.length === 0) return { view, layout: EMPTY };
  parts.sort((a, b) => (a < b ? -1 : 1));
  return { view, layout: sharedBoxStyle(parts.join(';'), style as BoxStyleProps) };
}

// A box with no shorthand at all still must not mint an object per render.
const EMPTY: ViewStyle = {};

export type { BoxProps };
export { Box, Column, Row, Spacer };
