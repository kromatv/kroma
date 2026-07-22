import { Tabs } from 'expo-router';
import { PillTabBar } from '../../../components/PillTabBar';
import {
  FilmTabIcon,
  HomeTabIcon,
  ProfileTabIcon,
  SearchTabIcon,
  SeriesTabIcon,
} from '../../../components/tabIcons';
import { useT } from '../../../lib/i18n';
import { colors } from '../../../lib/theme';

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs
      // Floating glass pill: content scrolls underneath (screens pad their
      // scroll views with TAB_BAR_CLEARANCE).
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color }) => <HomeTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('nav.search'),
          tabBarIcon: ({ color }) => <SearchTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="films"
        options={{
          title: t('nav.films'),
          tabBarIcon: ({ color }) => <FilmTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="series"
        options={{
          title: t('nav.series'),
          tabBarIcon: ({ color }) => <SeriesTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.account'),
          tabBarIcon: ({ color }) => <ProfileTabIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
