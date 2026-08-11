// Floating tab-bar capsule around the kit's <NavPill>: the expo-router glue and
// the iOS/Android backdrop split. Screens scroll underneath, padding by
// TAB_BAR_CLEARANCE.

import { Box, NavPill, NavPillItem, onPaper, styles } from '@kroma/ui/kit';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
// expo-router vendors react-navigation and does not re-export this type from its root.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastMiniBar } from '#mobile/components/cast/CastMiniBar';

export function PillTabBar({ state, descriptors, navigation }: Readonly<BottomTabBarProps>) {
  const insets = useSafeAreaInsets();
  return (
    <Box pointerEvents="box-none" style={[s.dock, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      {/* Renders nothing when not casting. */}
      <CastMiniBar />
      {/* Unclipped wrapper: the pill itself clips the blur. */}
      <Box style={s.shadow}>
        <NavPill
          size="sm"
          // Null is the slide ending - nothing to feel there.
          onPreview={(label) => {
            if (label !== null) void Haptics.selectionAsync();
          }}
          backdrop={
            Platform.OS === 'ios' ? (
              <BlurView
                tint={onPaper() ? 'light' : 'dark'}
                intensity={60}
                style={StyleSheet.absoluteFill}
              />
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
                // Handed the item's current ink so the colour travels with the lens.
                icon={(ink) => options.tabBarIcon?.({ focused, color: ink, size: 22 })}
                label={label}
                active={focused}
                onPress={onPress}
              />
            );
          })}
        </NavPill>
      </Box>
    </Box>
  );
}

const s = styles({
  dock: { absolute: true, right: 0, left: 0, align: 'center' },
  shadow: {
    radius: 999,
    shadowColor: 'black',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
