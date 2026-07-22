// Home: brand header, Netflix-style billboard, quick category chips, continue
// watching, my list, then the server's personalized rails.

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '#mobile/components/Avatar';
import { ContinueRail, MediaRail, movieCard, sectionCard } from '#mobile/components/cards';
import { HeroBillboard } from '#mobile/components/HeroBillboard';
import { KromaLockup } from '#mobile/components/KromaLockup';
import { Chip, ErrorView, Loading, SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, posterWidth, spacing, TAB_BAR_CLEARANCE } from '#mobile/lib/theme';
import { DownloadIcon } from '#mobile/player/icons';

function HomeHeader() {
  const { user } = useSession();
  const client = useClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const avatar = client.resolveArt(user?.avatarUrl);
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.brandRow}>
        <KromaLockup height={20} />
      </View>
      <View style={styles.headerActions}>
        <Pressable onPress={() => router.push('/downloads' as never)} hitSlop={10}>
          <DownloadIcon size={22} />
        </Pressable>
        <Pressable onPress={() => router.push('/profile' as never)} hitSlop={8}>
          <Avatar uri={avatar} name={user?.username} size={28} />
        </Pressable>
      </View>
    </View>
  );
}

function CategoryChips() {
  const t = useT();
  const router = useRouter();
  const chips = [
    { label: t('nav.films'), route: '/films' },
    { label: t('nav.series'), route: '/series' },
    { label: t('nav.genres'), route: '/genres' },
  ];
  return (
    <View style={styles.chips}>
      {chips.map((chip) => (
        <Chip
          key={chip.route}
          label={chip.label}
          onPress={() => router.push(chip.route as never)}
        />
      ))}
    </View>
  );
}

function MyListRail() {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);
  const ids = useQuery({ queryKey: ['myList'], queryFn: () => client.myList() });
  const items = useQuery({
    queryKey: ['myListItems', ids.data],
    enabled: (ids.data?.length ?? 0) > 0,
    queryFn: async () => {
      const found = await Promise.all(
        (ids.data ?? []).slice(0, 24).map((id) => client.item(id).catch(() => null)),
      );
      return found.filter((x) => x !== null);
    },
  });
  if (!items.data?.length) return null;
  return (
    <View>
      <SectionTitle>{t('nav.myList')}</SectionTitle>
      <MediaRail cards={items.data.map((m) => movieCard(m, client, cardW))} />
    </View>
  );
}

export default function Home() {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);

  const featured = useQuery({
    queryKey: ['featured'],
    queryFn: () => client.featured(),
    staleTime: 5 * 60_000,
  });
  const home = useQuery({ queryKey: ['home'], queryFn: () => client.home() });
  const cont = useQuery({
    queryKey: ['continue'],
    queryFn: () => client.continueWatching(),
    staleTime: 30_000,
  });

  if (home.isPending) return <Loading label={t('common.loading')} />;
  if (home.isError)
    return (
      <ErrorView
        message={t('error.serverBody')}
        retryLabel={t('error.retry')}
        onRetry={() => home.refetch()}
      />
    );

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={home.isRefetching}
          onRefresh={() => {
            void home.refetch();
            void cont.refetch();
            void featured.refetch();
          }}
          tintColor={colors.textDim}
        />
      }
    >
      <HomeHeader />
      <CategoryChips />
      {featured.data ? <HeroBillboard entry={featured.data} /> : null}
      {cont.data?.length ? (
        <View>
          <SectionTitle>{t('content.continueWatching')}</SectionTitle>
          <ContinueRail entries={cont.data} client={client} />
        </View>
      ) : null}
      <MyListRail />
      {(home.data ?? [])
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <View key={section.id}>
            <SectionTitle>{section.title}</SectionTitle>
            <MediaRail cards={section.items.map((i) => sectionCard(i, client, cardW))} />
          </View>
        ))}
      <View style={{ height: TAB_BAR_CLEARANCE }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
});
