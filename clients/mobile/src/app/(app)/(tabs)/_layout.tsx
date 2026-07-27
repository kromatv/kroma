import { Icon, type IconName } from '@kroma/ui/kit';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import type { ColorValue } from 'react-native';
import { PillTabBar } from '#mobile/components/PillTabBar';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';

const renderTabBar = (props: BottomTabBarProps) => <PillTabBar {...props} />;

/** The tab bar, one row per tab: the route, its kit glyph, its title key. */
const TABS = [
  { name: 'index', icon: 'home', title: 'nav.home' },
  { name: 'search', icon: 'search', title: 'nav.search' },
  { name: 'films', icon: 'movie', title: 'nav.films' },
  { name: 'series', icon: 'device-tv', title: 'nav.series' },
  { name: 'mylist', icon: 'bookmark', title: 'nav.myList' },
  { name: 'profile', icon: 'user-circle', title: 'nav.account' },
] as const satisfies readonly { name: string; icon: IconName; title: string }[];

// Built once at module level so React sees the same component identity on
// every render of the layout. The glyphs are the KIT's - the same shared
// Tabler set every surface draws from.
const SCREENS = TABS.map((tab) => ({
  ...tab,
  tabBarIcon: ({ color }: { color: ColorValue }) => (
    <Icon name={tab.icon} size={24} stroke={1.8} color={String(color)} />
  ),
}));

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs
      // Floating glass pill: content scrolls underneath (screens pad their
      // scroll views with TAB_BAR_CLEARANCE).
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {SCREENS.map(({ name, title, tabBarIcon }) => (
        <Tabs.Screen key={name} name={name} options={{ title: t(title), tabBarIcon }} />
      ))}
    </Tabs>
  );
}
