import { ItemId, type SectionItem, ShowId } from '@kroma/client/media';
import { Box, color, Icon, IconButton, styles, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueRail, MediaRail, sectionCard } from '#mobile/components/cards';
import { CastIconButton } from '#mobile/components/cast/CastIconButton';
import { HeroBillboard } from '#mobile/components/HeroBillboard';
import { HomeFilterChips } from '#mobile/components/HomeFilterChips';
import { KromaLockup } from '#mobile/components/KromaLockup';
import { NotificationBell } from '#mobile/components/NotificationBell';
import { ProgressRing } from '#mobile/components/ProgressRing';
import { ErrorView, Loading, SectionTitle } from '#mobile/components/ui';
import { useDownloads } from '#mobile/lib/downloads';
import { featuredProgress } from '#mobile/lib/featured';
import { filterEntries, filterResume, type TitleFilter } from '#mobile/lib/homeFilter';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { posterWidth, spacing, TAB_BAR_CLEARANCE } from '#mobile/lib/theme';

function DownloadsGlyph() {
  const downloads = useDownloads();
  const pending = downloads.downloading.length + downloads.queuedItems.length;
  if (pending === 0) return <Icon name="download" size={22} thickness={2} />;
  const progress = downloads.downloading[0]?.progress ?? -1;
  return (
    <Box style={s.dlGlyph}>
      <ProgressRing progress={progress} size={26} thickness={2.5} />
      {progress >= 0 ? (
        <Box pointerEvents="none" style={s.dlArrow}>
          <Icon name="download" size={12} thickness={2.6} />
        </Box>
      ) : null}
      {pending > 1 ? (
        <Box style={s.dlCount}>
          <Text style={s.dlCountText}>{pending}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function HomeHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  return (
    <Box style={[s.header, { paddingTop: insets.top + spacing.sm }, gutters.style]}>
      <Box style={s.brandRow}>
        <KromaLockup height={20} />
      </Box>
      <Box style={s.headerActions}>
        <CastIconButton />
        <IconButton
          variant="ghost"
          diameter={40}
          glyph={22}
          hitSlop={10}
          onPress={() => router.push('/downloads' as never)}
        >
          <DownloadsGlyph />
        </IconButton>
        <NotificationBell />
      </Box>
    </Box>
  );
}

function MyListRail({ filter }: Readonly<{ filter: TitleFilter }>) {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);
  const ids = useQuery(client.query.playback.myList());
  const items = useQuery({
    queryKey: ['myListItems', ids.data],
    enabled: (ids.data?.length ?? 0) > 0,
    // A list id names a movie OR a show, so a miss on the item endpoint is
    // retried as a show rather than dropped.
    queryFn: async (): Promise<SectionItem[]> => {
      const found = await Promise.all(
        (ids.data ?? []).slice(0, 24).map(async (id): Promise<SectionItem | null> => {
          const movie = await client.media.item(ItemId.parse(id)).catch(() => null);
          if (movie) return { type: 'movie', item: movie };
          const detail = await client.media.show(ShowId.parse(id)).catch(() => null);
          return detail ? { type: 'show', show: detail.show } : null;
        }),
      );
      return found.filter((entry) => entry !== null);
    },
  });
  const entries = filterEntries(items.data ?? [], filter);
  if (entries.length === 0) return null;
  return (
    <Box>
      <SectionTitle>{t('nav.myList')}</SectionTitle>
      <MediaRail cards={entries.map((entry) => sectionCard(entry, client, cardW))} />
    </Box>
  );
}

export default function Home() {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);
  const [filter, setFilter] = useState<TitleFilter>(null);

  const featured = useQuery({ ...client.query.media.featured(), staleTime: 5 * 60_000 });
  const home = useQuery(client.query.media.home());
  const cont = useQuery({
    ...client.query.playback.continueWatching(),
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

  const hero = filterEntries(featured.data ? [featured.data] : [], filter)[0] ?? null;
  const resume = filterResume(cont.data ?? [], filter);
  const sections = (home.data ?? [])
    .map((section) => ({ ...section, items: filterEntries(section.items, filter) }))
    .filter((section) => section.items.length > 0);

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
          tintColor={color('textMuted')}
        />
      }
    >
      <HomeHeader />
      <HomeFilterChips filter={filter} onFilter={setFilter} />
      {hero ? (
        <HeroBillboard entry={hero} progress={featuredProgress(hero, cont.data ?? [])} />
      ) : null}
      {resume.length > 0 ? (
        <Box>
          <SectionTitle>{t('content.continueWatching')}</SectionTitle>
          <ContinueRail entries={resume} client={client} />
        </Box>
      ) : null}
      <MyListRail filter={filter} />
      {sections.map((section) => (
        <Box key={section.id}>
          <SectionTitle>{section.title}</SectionTitle>
          <MediaRail cards={section.items.map((i) => sectionCard(i, client, cardW))} />
        </Box>
      ))}
      <Box style={{ height: TAB_BAR_CLEARANCE }} />
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
});
