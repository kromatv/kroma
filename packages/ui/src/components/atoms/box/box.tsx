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
import { type BoxStyleProps, splitShorthand, styles, useBreakpointStep } from '#ui/core';
import { sharedBoxStyle } from '#ui/lib/box-style';
import { Slot } from '#ui/lib/slot';

interface BoxProps extends BoxStyleProps, Omit<ViewProps, 'style'> {
  children?: ReactNode;
  /** Render onto the one child instead of adding a <View>: the box's layout and
   *  style merge under the child's own (see lib/slot). For a wrapper whose only
   *  job is what its child could carry itself. */
  asChild?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Forwarded to the underlying host view. React 19 takes `ref` as a plain
   *  prop, so no forwardRef wrapper is needed; it is declared explicitly because
   *  ViewProps does not carry it. */
  ref?: Ref<View>;
  /** Browser targets only: becomes `data-*` on the host element. Declared here
   *  because only react-native-web's own `ViewProps` carries it. */
  dataSet?: Record<string, string | number | undefined>;
}

function Box({ children, asChild, style, ref, ...props }: Readonly<BoxProps>) {
  const split = splitShorthand(props);
  const Host = asChild ? Slot : View;
  // A box holding a breakpoint object is a different component, not a branch:
  // it is the only one that has to follow the design width, and a hook here
  // would tax every box in the app with a subscription it never reads.
  if (split.breakpoints !== 0) {
    return (
      <FluidBox host={Host} split={split} style={style} ref={ref}>
        {children}
      </FluidBox>
    );
  }
  return (
    <Host {...split.rest} ref={ref} style={[layoutOf(split, 0), style]}>
      {children}
    </Host>
  );
}

type Split = ReturnType<typeof splitShorthand>;

interface FluidBoxProps {
  host: typeof View | typeof Slot;
  split: Split;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<View>;
  children?: ReactNode;
}

function FluidBox({ host: Host, split, style, ref, children }: Readonly<FluidBoxProps>) {
  const step = useBreakpointStep(split.breakpoints);
  return (
    <Host {...split.rest} ref={ref} style={[layoutOf(split, step), style]}>
      {children}
    </Host>
  );
}

/** Horizontal <Box>. Sugar for the single most common case, and it reads better
 * at a call site than `row` buried among a dozen other props. */
function Row(props: Readonly<BoxProps>) {
  return <Box row align="center" {...props} />;
}

/** Vertical <Box>. React Native already stacks in a column, so this exists for
 * symmetry with <Row> and to make intent explicit at the call site. */
function Column(props: Readonly<BoxProps>) {
  return <Box {...props} />;
}

/** Pushes whatever follows it to the far end of a <Row>. */
function Spacer() {
  return <View style={s.spacer} />;
}

const s = styles({ spacer: { flex: true } });

// Anything the vocabulary does not name is a real View prop and is forwarded
// untouched (onLayout, pointerEvents, testID, accessibility...). The resolved
// half becomes one style object shared by identity between every box asking for
// the same thing (see `sharedBoxStyle`), keyed on the split's canonical key
// rather than on the finished style, since the key is thrown away on a hit. The
// step joins that key only for a box that states a value per breakpoint, so a
// flat one still mints the single entry it always has.
function layoutOf(split: Split, step: number): ViewStyle {
  if (!split.key) return EMPTY;
  const key = split.breakpoints === 0 ? split.key : `${step}|${split.key}`;
  return sharedBoxStyle(key, split.shorthand as BoxStyleProps);
}

// A box with no shorthand at all still must not mint an object per render.
const EMPTY: ViewStyle = {};

export type { BoxProps };
export { Box, Column, Row, Spacer };
