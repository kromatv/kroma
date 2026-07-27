// Floating liquid-glass tab bar: a centered capsule hovering above the
// content instead of an edge-to-edge bar. Screens keep scrolling underneath
// (they already pad by TAB_BAR_CLEARANCE).
//
// The capsule is the kit's <NavPill> - the same one the TV's top nav draws at
// 10-foot metrics - at `sm`: inactive routes icon-only, the focused route in
// its own amber lens with the label. What stays here is the expo-router glue
// (routes, events) and the platform split this file has always owned: iOS gets
// its BlurView (composited on the GPU), passed to the pill as `backdrop`;
// Android keeps the solid fill.

import { NavPill, NavPillItem } from '@kroma/ui/kit';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
// Type-only deep import: expo-router vendors react-navigation and does not
// re-export the tab bar props type from its root.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PillTabBar({ state, descriptors, navigation }: Readonly<BottomTabBarProps>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: Math.max(insets.bottom, 12) + 8 }]}
    >
      {/* Shadow lives on an unclipped wrapper; the pill itself clips the blur. */}
      <View style={styles.shadow}>
        <NavPill
          size="sm"
          // The pill's slide reports each crossing; a selection tick under the
          // thumb is how the preview reads through a moving finger. Null is
          // the slide ending - nothing to feel there.
          onPreview={(label) => {
            if (label !== null) void Haptics.selectionAsync();
          }}
          backdrop={
            Platform.OS === 'ios' ? (
              <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
            ) : undefined
          }
        >
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title ?? route.name;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            return (
              <NavPillItem
                key={route.key}
                // The route's own icon component, handed the item's current
                // ink so its colour still travels with the amber lens.
                icon={(ink) => options.tabBarIcon?.({ focused, color: ink, size: 22 })}
                label={label}
                active={focused}
                onPress={onPress}
              />
            );
          })}
        </NavPill>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shadow: {
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
