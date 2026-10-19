import type { ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { NAVIGATED, POINTERLESS } from './control-platform';

/** A native control's painted face: a plain animated view on a pointerless television, the `renderTouch` pressable elsewhere, told whether it must stay unfocusable. */
export function PointerFace({
  style,
  render,
  renderTouch,
}: Readonly<{
  style: StyleProp<ViewStyle>[];
  render: (pressed: boolean) => ReactNode;
  renderTouch: (unfocusable: boolean) => ReactNode;
}>): ReactNode {
  if (POINTERLESS) return <Animated.View style={style}>{render(false)}</Animated.View>;
  return renderTouch(NAVIGATED);
}
