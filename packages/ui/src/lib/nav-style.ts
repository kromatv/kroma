import type { ComponentProps } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import type { SpatialNavigationView } from 'react-tv-space-navigation';

/** The navigator's own `style` type follows whichever react-native copy the
 * consuming app resolves (the tvos fork on a TV, mainline on the phone), and
 * those two are not assignable to each other. Flatten once, here. */
type NavigatorStyle = ComponentProps<typeof SpatialNavigationView>['style'];

export const flat = (style: StyleProp<ViewStyle>[] | StyleProp<ViewStyle>): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;
