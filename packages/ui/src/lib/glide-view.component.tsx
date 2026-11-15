import { type ReactNode, useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import type { Ease } from './ease';

/** A view whose translation and opacity glide to new values. */
export interface GlideViewProps {
  x?: number;
  y?: number;
  opacity?: number;
  ms: number;
  easing: Ease;
  /** Jump with no transition, for a gesture driving the value. */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function useGlide(target: number, ms: number, easing: Ease, still: boolean): Animated.Value {
  const [value] = useState(() => new Animated.Value(target));
  useEffect(() => {
    if (still) {
      value.setValue(target);
      return;
    }
    Animated.timing(value, {
      toValue: target,
      duration: ms,
      easing: easing.native,
      useNativeDriver: true,
    }).start();
  }, [value, target, ms, easing, still]);
  return value;
}

/** Native driver on native, a compositor CSS transition on the browser targets. */
export function GlideView({
  x = 0,
  y = 0,
  opacity = 1,
  ms,
  easing,
  still = false,
  style,
  children,
}: Readonly<GlideViewProps>) {
  const tx = useGlide(x, ms, easing, still);
  const ty = useGlide(y, ms, easing, still);
  const op = useGlide(opacity, ms, easing, still);
  return (
    <Animated.View
      style={[style, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }] }]}
    >
      {children}
    </Animated.View>
  );
}
