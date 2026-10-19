import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { ease } from './ease';

/** The two moving faces of a two-state control: a fill that fades in, a thumb that slides. */
export interface FlipMotion {
  fill: StyleProp<ViewStyle>;
  slide: StyleProp<ViewStyle>;
}

/** Flips one native-driven value, so the fill and the slide arrive together. */
export function useFlipMotion(on: boolean, travel: number, durationMs: number): FlipMotion {
  const [flip] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(flip, {
      toValue: on ? 1 : 0,
      duration: durationMs,
      easing: ease.out.native,
      useNativeDriver: true,
    }).start();
  }, [on, flip, durationMs]);
  const slide = flip.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  return {
    fill: { opacity: flip } as unknown as ViewStyle,
    slide: { transform: [{ translateX: slide }] } as unknown as ViewStyle,
  };
}
