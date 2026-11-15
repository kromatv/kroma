import {
  activeTheme,
  Box,
  color,
  styles,
  useStyleScope,
  useStyles,
  useThemeVersion,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { HeroBillboard } from '#mobile/components/HeroBillboard';
import { HomeFilterChips } from '#mobile/components/HomeFilterChips';
import { ContinueRail } from '#mobile/components/home/continue-rail';
import { HomeHeader } from '#mobile/components/home/home-header';
import { HomeSection } from '#mobile/components/home/home-section';
import { MyListRail } from '#mobile/components/home/my-list-rail';
import { ErrorView, Loading, SectionTitle } from '#mobile/components/ui';
import { featuredProgress } from '#mobile/lib/featured';
import { useHomeFeed } from '#mobile/lib/home-feed';
import {
  drawsClientMyList,
  featuredFallback,
  planHome,
  servesHero,
} from '#mobile/lib/home-sections';
import { filterResume, type TitleFilter } from '#mobile/lib/homeFilter';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { TAB_BAR_CLEARANCE } from '#mobile/lib/theme';

export default function Home() {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const [filter, setFilter] = useState<TitleFilter>(null);

  const home = useHomeFeed();
  const olderServer = home.isSuccess && !servesHero(home.data);
  const featured = useQuery({
    ...client.query.media.featured(),
    staleTime: 5 * 60_000,
    enabled: olderServer,
  });
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

  const plan = planHome(home.data, filter);
  const resumable = cont.data ?? [];
  const resume = filterResume(resumable, filter);
  const featuredPick = olderServer ? featuredFallback(featured.data, filter) : null;

  return (
    <ScrollView
      style={s.screen}
      refreshControl={
        <RefreshControl
          refreshing={home.isRefetching}
          onRefresh={() => {
            void home.refetch();
            void cont.refetch();
            if (olderServer) void featured.refetch();
          }}
          tintColor={color('textMuted', activeTheme(scope.theme))}
        />
      }
    >
      <HomeHeader />
      <HomeFilterChips filter={filter} onFilter={setFilter} />
      {plan.hero ? <HomeSection row={plan.hero} resumable={resumable} /> : null}
      {featuredPick ? (
        <HeroBillboard entry={featuredPick} progress={featuredProgress(featuredPick, resumable)} />
      ) : null}
      {resume.length > 0 ? (
        <Box>
          <SectionTitle>{t('content.continueWatching')}</SectionTitle>
          <ContinueRail entries={resume} />
        </Box>
      ) : null}
      {drawsClientMyList(home.data) ? <MyListRail filter={filter} /> : null}
      {plan.rows.map((row) => (
        <HomeSection key={row.id} row={row} resumable={resumable} />
      ))}
      <Box style={{ height: TAB_BAR_CLEARANCE }} />
    </ScrollView>
  );
}

const sDefinition = styles({
  screen: { flex: true, bg: 'bg' },
});
