import { Icon, type IconName, useTheme } from '@kroma/ui/kit';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import type { ColorValue } from 'react-native';
import { PillTabBar } from '#mobile/components/PillTabBar';
import { useT } from '#mobile/lib/i18n';

const renderTabBar = (props: BottomTabBarProps) => <PillTabBar {...props} />;

const TABS = [
  { name: 'index', icon: 'home', title: 'nav.home' },
  { name: 'search', icon: 'search', title: 'nav.search' },
  { name: 'films', icon: 'movie', title: 'nav.films' },
  { name: 'series', icon: 'device-tv', title: 'nav.series' },
  { name: 'mylist', icon: 'bookmark', title: 'nav.myList' },
  { name: 'profile', icon: 'user-circle', title: 'nav.account' },
] as const satisfies readonly { name: string; icon: IconName; title: string }[];

// Built once at module level so React sees the same component identity on every
// render of the layout.
const SCREENS = TABS.map((tab) => ({
  ...tab,
  tabBarIcon: ({ color }: { color: ColorValue }) => (
    <Icon name={tab.icon} size={24} thickness={1.8} color={String(color)} />
  ),
}));

export default function TabsLayout() {
  const t = useT();
  const theme = useTheme();
  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {SCREENS.map(({ name, title, tabBarIcon }) => (
        <Tabs.Screen key={name} name={name} options={{ title: t(title), tabBarIcon }} />
      ))}
    </Tabs>
  );
}
