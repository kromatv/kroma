import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import type { ColorValue } from 'react-native';
import { PillTabBar } from '#mobile/components/PillTabBar';
import {
  FilmTabIcon,
  HomeTabIcon,
  ProfileTabIcon,
  SearchTabIcon,
  SeriesTabIcon,
} from '#mobile/components/tabIcons';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';

// Render props for <Tabs>, defined once at module level so React sees the same
// component identity on every render of the layout.
interface TabBarIconProps {
  color: ColorValue;
}

const renderTabBar = (props: BottomTabBarProps) => <PillTabBar {...props} />;
const renderHomeIcon = ({ color }: TabBarIconProps) => <HomeTabIcon color={color} />;
const renderSearchIcon = ({ color }: TabBarIconProps) => <SearchTabIcon color={color} />;
const renderFilmIcon = ({ color }: TabBarIconProps) => <FilmTabIcon color={color} />;
const renderSeriesIcon = ({ color }: TabBarIconProps) => <SeriesTabIcon color={color} />;
const renderProfileIcon = ({ color }: TabBarIconProps) => <ProfileTabIcon color={color} />;

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
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: renderHomeIcon,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('nav.search'),
          tabBarIcon: renderSearchIcon,
        }}
      />
      <Tabs.Screen
        name="films"
        options={{
          title: t('nav.films'),
          tabBarIcon: renderFilmIcon,
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          title: t('nav.series'),
          tabBarIcon: renderSeriesIcon,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.account'),
          tabBarIcon: renderProfileIcon,
        }}
      />
    </Tabs>
  );
}
