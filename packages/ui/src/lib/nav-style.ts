import type { NavigatorViewProps } from '@kroma/spatial-nav/react';
import type { StyleProp, ViewStyle } from 'react-native';
import { registered } from '#ui/core';

// The navigator's `style` type follows whichever react-native copy the app
// resolves (the tvos fork on a TV, mainline on the phone), and the two are not
// assignable to each other.
type NavigatorStyle = NavigatorViewProps['style'];

export const flat = (style: StyleProp<ViewStyle>[] | StyleProp<ViewStyle>): NavigatorStyle =>
  registered(style as never) as NavigatorStyle;
