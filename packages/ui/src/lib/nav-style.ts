import type { ComponentProps } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import type { SpatialNavigationView } from 'react-tv-space-navigation';

// The navigator's `style` type follows whichever react-native copy the app
// resolves (the tvos fork on a TV, mainline on the phone), and the two are not
// assignable to each other.
type NavigatorStyle = ComponentProps<typeof SpatialNavigationView>['style'];

export const flat = (style: StyleProp<ViewStyle>[] | StyleProp<ViewStyle>): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;
