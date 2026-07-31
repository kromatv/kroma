import { Chip, Icon, IconButton, styles } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '#mobile/components/Avatar';
import {
  ContinueRail,
  MediaRail,
  movieCard,
  sectionCard,
  showCard,
} from '#mobile/components/cards';
import { CastIconButton } from '#mobile/components/cast/CastIconButton';
import { HeroBillboard } from '#mobile/components/HeroBillboard';
import { KromaLockup } from '#mobile/components/KromaLockup';
import { NotificationBell } from '#mobile/components/NotificationBell';
import { ProgressRing } from '#mobile/components/ProgressRing';
import { ErrorView, Loading, SectionTitle } from '#mobile/components/ui';
import { useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, posterWidth, spacing, TAB_BAR_CLEARANCE } from '#mobile/lib/theme';

function DownloadsGlyph() {
  const downloads = useDownloads();
  const pending = downloads.downloading.length + downloads.queuedItems.length;
  if (pending === 0) return <Icon name="download" size={22} stroke={2} />;
  const progress = downloads.downloading[0]?.progress ?? -1;
  return (
    <View style={s.dlGlyph}>
      <ProgressRing progress={progress} size={26} stroke={2.5} />
      {progress >= 0 ? (
        <View pointerEvents="none" style={s.dlArrow}>
          <Icon name="download" size={12} stroke={2.6} />
        </View>
      ) : null}
      {pending > 1 ? (
        <View style={s.dlCount}>
          <Text style={s.dlCountText}>{pending}</Text>
        </View>
      ) : null}
    </View>
  );
}

function HomeHeader() {
  const { user } = useSession();
  const client = useClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const avatar = client.resolveArt(user?.avatarUrl);
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }, gutters.style]}>
      <View style={s.brandRow}>
        <KromaLockup height={20} />
      </View>
      <View style={s.headerActions}>
        <CastIconButton />
        <IconButton
          variant="ghost"
          size={40}
          glyph={22}
          hitSlop={10}
          onPress={() => router.push('/downloads' as never)}
        >
          <DownloadsGlyph />
        </IconButton>
        <NotificationBell />
        <IconButton
          variant="ghost"
          size={40}
          hitSlop={8}
          onPress={() => router.push('/profile' as never)}
        >
          <Avatar uri={avatar} name={user?.username} size={28} />
        </IconButton>
      </View>
    </View>
  );
}

function CategoryChips() {
  const t = useT();
  const router = useRouter();
  const gutters = useGutters();
  const chips = [
    { label: t('nav.films'), route: '/films' },
    { label: t('nav.series'), route: '/series' },
    { label: t('nav.genres'), route: '/genres' },
  ];
  return (
    <View style={[s.chips, gutters.style]}>
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
    // A list id names a movie OR a show, so a miss on the item endpoint is
    // retried as a show rather than dropped.
    queryFn: async () => {
      const found = await Promise.all(
        (ids.data ?? []).slice(0, 24).map(async (id) => {
          const movie = await client.item(id).catch(() => null);
          if (movie) return { kind: 'movie', movie } as const;
          const detail = await client.show(id).catch(() => null);
          return detail ? ({ kind: 'show', show: detail.show } as const) : null;
        }),
      );
      return found.filter((x) => x !== null);
    },
  });
  if (!items.data?.length) return null;
  return (
    <View>
      <SectionTitle>{t('nav.myList')}</SectionTitle>
      <MediaRail
        cards={items.data.map((entry) =>
          entry.kind === 'movie'
            ? movieCard(entry.movie, client, cardW)
            : showCard(entry.show, client, cardW),
        )}
      />
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
      style={s.screen}
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

const s = styles({
  screen: { flex: true, bg: 'bg' },
  header: { row: true, between: true, align: 'center', pt: spacing.sm },
  brandRow: { row: true, align: 'center' },
  // The buttons carry their own 40pt targets, so this gap spaces glyphs, not
  // touch areas.
  headerActions: { row: true, align: 'center', gap: 6 },
  dlGlyph: { center: true, w: 26, h: 26 },
  dlArrow: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, center: true },
  dlCount: {
    absolute: true,
    top: -5,
    right: -8,
    center: true,
    h: 15,
    minW: 15,
    px: 3,
    bg: 'accent',
    radius: 8,
  },
  dlCountText: { color: 'accentInk', fontSize: 10, fontWeight: '700' },
  chips: { row: true, gap: 8, mt: spacing.md },
});
