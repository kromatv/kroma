// The blinking insertion point, shared by every field that draws its own.
//
// react-native-web has no real caret to show while the remote walks an
// on-screen keyboard, and the OTP field has no single text box to put one in, so
// both draw the bar themselves. They were drawing the same bar, at the same
// rate, with the same reasoning written out twice - and a caret that blinks at
// two different rates depending on which field you are in is the sort of thing
// nobody files a bug about and everybody notices.

import { Animated } from 'react-native';
import { useLoop } from '#ui/lib/loop';
import { colors, radius as radii } from '#ui/lib/tokens';

/** A full on/off cycle. */
export const BLINK_MS = 1100;

export interface CaretProps {
  /** As tall as the line it sits in: the OTP slots are bigger than a text row,
   *  and bigger again on a television. */
  height: number;
  /** Laid over the slot rather than in the flow, which is what an OTP field
   *  needs and a text row does not. */
  absolute?: boolean;
}

/** It is on screen for as long as the field is, so it goes through `useLoop` (a
 * CSS keyframe on the browser TVs) rather than paying a JS frame callback of its
 * own the whole time. */
export function Caret({ height, absolute = false }: Readonly<CaretProps>) {
  const blink = useLoop('blink', BLINK_MS);
  return (
    <Animated.View
      style={[
        {
          position: absolute ? 'absolute' : 'relative',
          width: 2,
          height,
          borderRadius: radii.sm,
          backgroundColor: colors.accent,
        },
        blink,
      ]}
    />
  );
}
