import { View, type ViewStyle } from 'react-native';
import type { GlideViewProps } from './glide-view';

/** Native driver on native, a compositor CSS transition on the browser targets. */
export function GlideView({
  x,
  y,
  opacity,
  ms,
  easing,
  still = false,
  style,
  children,
}: Readonly<GlideViewProps>) {
  const moves = x !== undefined || y !== undefined;
  const motion = {
    opacity,
    transform: moves ? [{ translateX: x ?? 0 }, { translateY: y ?? 0 }] : undefined,
    transitionProperty: moves ? 'transform, opacity' : 'opacity',
    transitionDuration: still ? '0ms' : `${ms}ms`,
    transitionTimingFunction: easing.css,
  } as ViewStyle;
  return <View style={[style, motion]}>{children}</View>;
}
