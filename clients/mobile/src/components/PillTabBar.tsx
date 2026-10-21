import { Box, radius as cornerRadius, NavPill, styles, useStyles } from '@kromatv/ui/kit';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastMiniBar } from '#mobile/components/cast/CastMiniBar';

const GLYPH = 24;

export function PillTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: Readonly<BottomTabBarProps>) {
  const s = useStyles(sDefinition);

  const insets = useSafeAreaInsets();
  return (
    <Box pointerEvents="box-none" style={[s.dock, { bottom: insets.bottom + 8 }]}>
      {/* Renders nothing when not casting. */}
      <CastMiniBar />
      {/* Unclipped wrapper: the pill itself clips the blur. */}
      <Box style={s.shadow}>
        <NavPill.Root
          size="sm"
          tone="neutral"
          labels="none"
          // Null is the slide ending - nothing to feel there.
          onPreview={(label) => {
            if (label !== null) void Haptics.selectionAsync();
          }}
        >
          {Platform.OS === 'ios' ? <NavPill.Backdrop amount={15} /> : null}
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title ?? route.name;
            const onPress = () => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            };
            return (
              <NavPill.Item
                key={route.key}
                // Handed the item's current ink so the colour travels with the lens.
                icon={(ink) => options.tabBarIcon?.({ focused, color: ink, size: GLYPH })}
                label={label}
                active={focused}
                onPress={onPress}
              />
            );
          })}
        </NavPill.Root>
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  dock: { absolute: true, right: 0, left: 0, px: 12, align: 'center' },
  shadow: {
    self: 'stretch',
    radius: cornerRadius.pill,
    shadowColor: 'black',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
