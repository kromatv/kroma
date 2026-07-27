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
import { type BoxStyleProps, sharedBoxStyle } from '#ui/lib/box-style';

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
  return <View style={SPACER} />;
}

const SPACER = { flex: 1 } as const;

/** Every style shorthand <Box> owns. Anything else is a real View prop and is
 * forwarded untouched (onLayout, pointerEvents, testID, accessibility...). */
const STYLE_PROPS = new Set([
  'flex',
  'row',
  'wrap',
  'center',
  'align',
  'justify',
  'self',
  'shrink',
  'grow',
  'gap',
  'between',
  'w',
  'h',
  'minW',
  'minH',
  'maxW',
  'maxH',
  'aspect',
  'fill',
  'absolute',
  'top',
  'right',
  'bottom',
  'left',
  'z',
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'bg',
  'radius',
  'border',
  'borderWidth',
  'shadow',
  'opacity',
  'overflow',
]);

/**
 * Split the shorthand props from the real View props, and resolve the first into
 * ONE style object that is shared by identity between every box asking for the
 * same thing (see `sharedBoxStyle` for why that matters so much here).
 *
 * The cache key is built during the split rather than from the finished style:
 * the shorthands are all primitives, there are at most a few per box, and the
 * key is thrown away on a hit - which is the common case - so this is cheaper
 * than resolving the style and hashing that.
 *
 * `STYLE_PROPS` is iterated in ITS order, not the caller's, so `row gap={4}` and
 * `gap={4} row` are one entry rather than two.
 */
function splitProps(props: Record<string, unknown>): {
  view: Record<string, unknown>;
  layout: ViewStyle;
} {
  const style: Record<string, unknown> = {};
  const view: Record<string, unknown> = {};
  let any = false;
  for (const key of Object.keys(props)) {
    if (STYLE_PROPS.has(key)) {
      style[key] = props[key];
      any = true;
    } else view[key] = props[key];
  }
  if (!any) return { view, layout: EMPTY };
  let key = '';
  for (const name of STYLE_PROPS) {
    const value = style[name];
    if (value === undefined) continue;
    // A transform is an array of objects; everything else is a primitive. The
    // primitive side is named explicitly so String() never meets an object.
    const primitive =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    const part = primitive ? String(value) : JSON.stringify(value);
    key += `${name}:${part};`;
  }
  return { view, layout: sharedBoxStyle(key, style as BoxStyleProps) };
}

/** A box with no shorthand at all still must not mint an object per render. */
const EMPTY: ViewStyle = {};

export type { BoxProps };
export { Box, Column, Row, Spacer };
