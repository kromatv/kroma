import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

/** Content inside a page scroller that dissolves to transparent as it scrolls up past `inset` below the scroller's top edge, over the next 80 px: a real mask, so whatever is truly behind it shows. Nothing on native, which has no mask. */
export function ScrollMask({
  style,
  children,
}: Readonly<{ inset: number; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
  return <View style={style}>{children}</View>;
}
