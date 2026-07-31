// The blinking insertion point, shared by every field that draws its own:
// react-native-web has no real caret to show while the remote walks an on-screen
// keyboard, and the OTP field has no single text box to put one in.

import { Animated } from 'react-native';
import { sharedStyle } from '#ui/core';
import { useLoop } from '#ui/lib/loop';

export const BLINK_MS = 1100;

export interface CaretProps {
  height: number;
  absolute?: boolean;
}

/** Blinks through `useLoop` - a CSS keyframe on the browser TVs - rather than
 * paying a JS frame callback for as long as the field is on screen. */
export function Caret({ height, absolute = false }: Readonly<CaretProps>) {
  const blink = useLoop('blink', BLINK_MS);
  const bar = sharedStyle(`caret:${height}:${absolute}`, {
    absolute,
    w: 2,
    h: height,
    radius: 'sm',
    bg: 'accent',
  });
  return <Animated.View style={[bar, blink]} />;
}
