// Series detail: hero, up-next play block, season picker, episode list. Tap an
// episode to play; long-press for its detail page. Row components live in
// components/showEpisodes.tsx.

import { sizedImageUrl } from '@kroma/core';
import { Box, Button, Chip, styles, Txt } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, type View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { CastRail, DetailHero, MetaBadge } from '#mobile/components/detail';
import { type PopoverAnchor, PopoverMenu } from '#mobile/components/PopoverMenu';
import { EpisodeRow, SeasonDownload, UpNextCard } from '#mobile/components/showEpisodes';
import { ErrorView, ExpandableText, Loading, SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters, useIsWide } from '#mobile/lib/layout';
import { routeParam } from '#mobile/lib/nav';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export default function ShowRoute() {
  const id = routeParam(useLocalSearchParams<{ id?: string }>().id);
  return id ? <ShowDetail id={id} /> : <Redirect href="/" />;
}

function ShowDetail({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { play } = usePlay();
  const { width } = useWindowDimensions();
  const wide = useIsWide();
  // Landscape-safe page gutters (grow past spacing.md to clear the notch).
  const gutterPad = useGutters().style;
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [seasonAnchor, setSeasonAnchor] = useState<PopoverAnchor | null>(null);
  const seasonButtonRef = useRef<View>(null);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const detail = useQuery({ queryKey: ['show', id], queryFn: () => client.show(id) });
  const upNext = useQuery({
    queryKey: ['upNext', id],
    queryFn: () => client.upNext(id),
    staleTime: 30_000,
  });
  const progress = useQuery({
    queryKey: ['allProgress'],
    queryFn: () => client.progress(),
    staleTime: 30_000,
  });
  const watched = useQuery({
    queryKey: ['watched'],
    queryFn: () => client.watched(),
    staleTime: 60_000,
  });

  if (detail.isPending) return <Loading label={t('common.loading')} />;
  if (detail.isError)
    return (
      <ErrorView
        message={t('error.serverBody')}
        retryLabel={t('error.retry')}
        onRetry={() => detail.refetch()}
      />
    );

  const { show, seasons } = detail.data;
  const season = seasons[Math.min(seasonIdx, seasons.length - 1)];
  const backdrop = sizedImageUrl(
    client.backdropFor(show) ?? client.showPosterFor(show),
    Math.min(1280, width),
  );
  const title = show.metadata?.title ?? show.title;
  const next = upNext.data?.item;
  const progressById = new Map((progress.data ?? []).map((p) => [p.itemId, p]));
  const watchedIds = new Set(watched.data ?? []);
  const nextProgress = next ? progressById.get(next.id) : undefined;
  const nextTotal = nextProgress?.durationMs ?? next?.durationMs ?? 0;
  const nextFrac =
    nextProgress && nextTotal > 0 ? Math.min(1, nextProgress.positionMs / nextTotal) : 0;
  const cast = show.metadata?.cast ?? season?.cast ?? [];
  const episodeKey = upNext.data?.resume ? 'player.resumeEpisode' : 'player.playEpisode';
  const playLabel =
    next?.season != null && next.episode != null
      ? t(episodeKey, { season: next.season, episode: next.episode })
      : t('player.play');

  return (
    <Animated.ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <DetailHero
        scrollY={scrollY}
        art={backdrop}
        seed={show.id}
        title={title}
        meta={
          <>
            {show.year ? <Txt style={s.metaText}>{show.year}</Txt> : null}
            <Txt style={s.metaText}>{t('content.seasonCount', { count: show.seasonCount })}</Txt>
            {show.metadata?.rating ? (
              <Txt style={s.rating}>★ {show.metadata.rating.toFixed(1)}</Txt>
            ) : null}
            {show.video?.hdr ? <MetaBadge>HDR</MetaBadge> : null}
          </>
        }
      />

      {(() => {
        const info = (
          <>
            {next ? (
              <Button
                icon="player-play-filled"
                label={playLabel}
                onPress={() => void play(next.id)}
              />
            ) : null}

            {next ? <UpNextCard next={next} frac={nextFrac} /> : null}

            {show.metadata?.overview ? (
              <ExpandableText>{show.metadata.overview}</ExpandableText>
            ) : null}
            {show.metadata?.genres?.length ? (
              <Box style={s.genreRow}>
                {show.metadata.genres.slice(0, 4).map((genre) => (
                  <Chip
                    key={genre}
                    label={genre}
                    onPress={() => router.push(`/genre/${encodeURIComponent(genre)}` as never)}
                  />
                ))}
              </Box>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon="flag"
              label={t('report.action')}
              style={s.reportRow}
              onPress={() =>
                router.push(
                  `/report/${show.id}?kind=show&title=${encodeURIComponent(title)}` as never,
                )
              }
            />
          </>
        );

        const episodesPane = (
          <>
            <Box style={[s.tabsRow, wide ? s.tabsRowWide : gutterPad]}>
              <Box style={s.tabActive}>
                <Txt style={s.tabActiveText}>{t('content.episodes')}</Txt>
              </Box>
            </Box>

            <Box style={[s.seasonHeader, !wide && gutterPad]}>
              <Button
                ref={seasonButtonRef}
                variant="glass"
                size="sm"
                iconRight="chevron-down"
                label={t('content.season', { number: season?.number ?? 1 })}
                onPress={() =>
                  seasonButtonRef.current?.measureInWindow(
                    (x: number, y: number, width: number, height: number) =>
                      setSeasonAnchor({ x, y, width, height }),
                  )
                }
              />
              <SeasonDownload episodes={season?.episodes ?? []} />
            </Box>

            <Box style={[s.episodes, !wide && gutterPad]}>
              {(season?.episodes ?? []).map((ep) => (
                <EpisodeRow
                  key={ep.id}
                  episode={ep}
                  progress={progressById.get(ep.id)}
                  watched={watchedIds.has(ep.id)}
                />
              ))}
            </Box>
          </>
        );

        return wide ? (
          <Box style={[s.split, gutterPad]}>
            <Box style={s.splitInfo}>{info}</Box>
            <Box style={s.splitEpisodes}>{episodesPane}</Box>
          </Box>
        ) : (
          <>
            <Box style={[s.body, gutterPad]}>{info}</Box>
            {episodesPane}
          </>
        );
      })()}

      {cast.length > 0 ? (
        <Box style={{ marginTop: spacing.lg }}>
          <SectionTitle>{t('content.cast')}</SectionTitle>
          <CastRail cast={cast} />
        </Box>
      ) : null}

      <PopoverMenu
        visible={seasonAnchor !== null}
        anchor={seasonAnchor}
        onClose={() => setSeasonAnchor(null)}
        items={seasons.map((s, i) => ({
          key: String(s.number),
          label: t('content.season', { number: s.number }),
          detail: t('content.episodeCount', { count: s.episodes.length }),
          active: i === seasonIdx,
          onPress: () => setSeasonIdx(i),
        }))}
      />
    </Animated.ScrollView>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  body: { gap: spacing.md, pt: spacing.md },
  metaText: { ...type.caption, color: 'text', fontWeight: '600' },
  rating: { ...type.caption, color: 'accentText', fontWeight: '700' },
  genreRow: { row: true, wrap: true, gap: 8 },
  reportRow: { self: 'flex-start' },
  tabsRow: {
    row: true,
    mt: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'border',
  },
  tabActive: { pb: 8, borderBottomWidth: 3, borderBottomColor: 'accent' },
  tabActiveText: { ...type.section, fontSize: 16 },
  seasonHeader: { row: true, between: true, align: 'center', mt: spacing.md, mb: spacing.sm },
  episodes: { gap: 4 },
  split: { row: true, align: 'flex-start', gap: spacing.lg, pt: spacing.md },
  splitInfo: { flex: 2, gap: spacing.md },
  splitEpisodes: { flex: 3 },
  tabsRowWide: { mt: 0 },
});
