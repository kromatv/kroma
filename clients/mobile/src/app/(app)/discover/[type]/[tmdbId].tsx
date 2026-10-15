import { hasPermission } from '@kromatv/client/accounts';
import { type DiscoverDetail, TmdbKind } from '@kromatv/client/discovery';
import { formatRuntime, sizedImageUrl } from '@kromatv/core';
import { useAskForTitle } from '@kromatv/core/react';
import { Box, Button, styles, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { DiscoverEpisodes } from '#mobile/components/DiscoverEpisodes';
import { CastRail, DetailHero } from '#mobile/components/detail';
import {
  ErrorBanner,
  ErrorView,
  ExpandableText,
  Loading,
  SectionTitle,
} from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { routeParam } from '#mobile/lib/nav';
import { useClient, useSession } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

const HERO_W = 1280;

function AskAction({ detail }: Readonly<{ detail: DiscoverDetail }>) {
  const t = useT();
  const client = useClient();
  const { status, asking, failed, ask } = useAskForTitle(client, detail);
  return (
    <>
      <Button
        variant="outline"
        icon="download"
        loading={asking}
        disabled={status !== null}
        label={status ? t('requests.newRequestExisting') : t('discover.request')}
        onPress={ask}
      />
      {failed ? <ErrorBanner message={t('discover.requestFailed')} /> : null}
    </>
  );
}

export default function DiscoverRoute() {
  const params = useLocalSearchParams<{ type?: string; tmdbId?: string }>();
  const kind = TmdbKind.safeParse(routeParam(params.type));
  const tmdbId = Number(routeParam(params.tmdbId));
  if (!(kind.success && Number.isFinite(tmdbId))) return <Redirect href="/" />;
  return <DiscoverScreen kind={kind.data} tmdbId={tmdbId} />;
}

function DiscoverScreen({ kind, tmdbId }: Readonly<{ kind: TmdbKind; tmdbId: number }>) {
  const t = useT();
  const client = useClient();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const gutters = useGutters();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const fiche = useQuery(client.query.discovery.detail(kind, tmdbId));

  if (fiche.isPending) return <Loading label={t('common.loading')} />;
  if (fiche.isError)
    return (
      <ErrorView
        message={t('requests.ledgerFailed')}
        retryLabel={t('error.retry')}
        onRetry={() => fiche.refetch()}
      />
    );

  const detail = fiche.data;
  if (detail.localId) {
    const owned = detail.kind === 'show' ? `/show/${detail.localId}` : `/item/${detail.localId}`;
    return <Redirect href={owned as never} />;
  }

  const span = detail.seasons.length
    ? t('content.seasonCount', { count: detail.seasons.length })
    : formatRuntime((detail.runtimeMin ?? 0) * 60_000);
  const kindLabel = t(detail.kind === 'show' ? 'discover.kindShow' : 'discover.kindMovie');

  return (
    <Animated.ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <DetailHero
        scrollY={scrollY}
        art={sizedImageUrl(
          client.media.artwork.resolve(detail.backdropUrl ?? detail.posterUrl),
          Math.min(HERO_W, width),
        )}
        seed={String(detail.tmdbId)}
        title={detail.title}
        context={`${kindLabel} · ${t('discover.notInLibrary')}`}
        meta={<DiscoverMeta detail={detail} span={span} />}
      />

      <Box style={[s.body, gutters.style]}>
        {user && hasPermission(user, 'requests.create') ? <AskAction detail={detail} /> : null}
        {detail.overview ? <ExpandableText>{detail.overview}</ExpandableText> : null}
      </Box>

      {detail.kind === 'show' ? (
        <DiscoverEpisodes tmdbId={detail.tmdbId} seasons={detail.seasons} />
      ) : null}

      {detail.cast.length > 0 ? (
        <Box>
          <SectionTitle>{t('content.cast')}</SectionTitle>
          <CastRail cast={detail.cast} />
        </Box>
      ) : null}
    </Animated.ScrollView>
  );
}

function DiscoverMeta({ detail, span }: Readonly<{ detail: DiscoverDetail; span: string }>) {
  return (
    <>
      {detail.year ? <Text style={s.metaText}>{detail.year}</Text> : null}
      {span ? <Text style={s.metaText}>{span}</Text> : null}
      {detail.genres[0] ? <Text style={s.metaText}>{detail.genres[0]}</Text> : null}
      {detail.rating ? <Text style={s.rating}>★ {detail.rating.toFixed(1)}</Text> : null}
    </>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  body: { gap: spacing.md, pt: spacing.md },
  metaText: { ...type.caption, color: 'text', fontWeight: '600' },
  rating: { ...type.caption, color: 'accentText', fontWeight: '700' },
});
