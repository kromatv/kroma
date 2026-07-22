// Series detail: cinematic hero, up-next play block, Netflix-style season
// dropdown with a bulk season download, episode list with progress / watched /
// downloads. Tap an episode to play; long-press for its detail page. The row
// components live in components/showEpisodes.tsx.

import { sizedImageUrl } from '@kroma/core';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { CastRail, DetailHero, MetaBadge } from '#mobile/components/detail';
import { type PopoverAnchor, PopoverMenu } from '#mobile/components/PopoverMenu';
import { EpisodeRow, SeasonDownload, UpNextCard } from '#mobile/components/showEpisodes';
import { Chip, ErrorView, ExpandableText, Loading, SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useIsWide } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';
import { ChevronDownIcon, FlagIcon, PlayIcon } from '#mobile/player/icons';

export default function ShowDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = useIsWide();
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
    Math.min(1280, width * 2),
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
      style={styles.screen}
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
            {show.year ? <Text style={styles.metaText}>{show.year}</Text> : null}
            <Text style={styles.metaText}>
              {t('content.seasonCount', { count: show.seasonCount })}
            </Text>
            {show.metadata?.rating ? (
              <Text style={styles.rating}>★ {show.metadata.rating.toFixed(1)}</Text>
            ) : null}
            {show.video?.hdr ? <MetaBadge>HDR</MetaBadge> : null}
          </>
        }
      />

      {(() => {
        const info = (
          <>
            {next ? (
              <Pressable
                onPress={() => router.push(`/player/${next.id}` as never)}
                style={({ pressed }) => [styles.play, pressed && { opacity: 0.85 }]}
              >
                <PlayIcon size={22} color={colors.accentInk} />
                <Text style={styles.playLabel}>{playLabel}</Text>
              </Pressable>
            ) : null}

            {next ? <UpNextCard next={next} frac={nextFrac} /> : null}

            {show.metadata?.overview ? (
              <ExpandableText>{show.metadata.overview}</ExpandableText>
            ) : null}
            {show.metadata?.genres?.length ? (
              <View style={styles.genreRow}>
                {show.metadata.genres.slice(0, 4).map((genre) => (
                  <Chip
                    key={genre}
                    label={genre}
                    onPress={() => router.push(`/genre/${encodeURIComponent(genre)}` as never)}
                  />
                ))}
              </View>
            ) : null}
            <Pressable
              onPress={() =>
                router.push(
                  `/report/${show.id}?kind=show&title=${encodeURIComponent(title)}` as never,
                )
              }
              style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.7 }]}
            >
              <FlagIcon size={16} color={colors.textDim} />
              <Text style={styles.reportLabel}>{t('report.action')}</Text>
            </Pressable>
          </>
        );

        const episodesPane = (
          <>
            <View style={[styles.tabsRow, wide && styles.tabsRowWide]}>
              <View style={styles.tabActive}>
                <Text style={styles.tabActiveText}>{t('content.episodes')}</Text>
              </View>
            </View>

            <View style={styles.seasonHeader}>
              <Pressable
                ref={seasonButtonRef}
                onPress={() =>
                  seasonButtonRef.current?.measureInWindow(
                    (x: number, y: number, width: number, height: number) =>
                      setSeasonAnchor({ x, y, width, height }),
                  )
                }
                style={({ pressed }) => [styles.seasonButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.seasonButtonText}>
                  {t('content.season', { number: season?.number ?? 1 })}
                </Text>
                <ChevronDownIcon size={16} />
              </Pressable>
              <SeasonDownload episodes={season?.episodes ?? []} />
            </View>

            <View style={styles.episodes}>
              {(season?.episodes ?? []).map((ep) => (
                <EpisodeRow
                  key={ep.id}
                  episode={ep}
                  progress={progressById.get(ep.id)}
                  watched={watchedIds.has(ep.id)}
                />
              ))}
            </View>
          </>
        );

        // Wide windows put the episode list beside the info column; narrow
        // ones keep the stacked flow.
        return wide ? (
          <View style={styles.split}>
            <View style={styles.splitInfo}>{info}</View>
            <View style={styles.splitEpisodes}>{episodesPane}</View>
          </View>
        ) : (
          <>
            <View style={styles.body}>{info}</View>
            {episodesPane}
          </>
        );
      })()}

      {cast.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <SectionTitle>{t('content.cast')}</SectionTitle>
          <CastRail cast={cast} />
        </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  metaText: { ...type.caption, color: colors.text, fontWeight: '600' },
  rating: { ...type.caption, color: colors.accent, fontWeight: '700' },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  playLabel: { color: colors.accentInk, fontSize: 16, fontWeight: '800' },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  reportLabel: { ...type.small, color: colors.textDim, fontWeight: '600' },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: colors.accent,
    paddingBottom: 8,
  },
  tabActiveText: { ...type.section, fontSize: 16 },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  seasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  seasonButtonText: { ...type.caption, color: colors.text, fontWeight: '700' },
  episodes: { paddingHorizontal: spacing.md, gap: 4 },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  splitInfo: { flex: 2, gap: spacing.md },
  splitEpisodes: { flex: 3 },
  tabsRowWide: { marginTop: 0 },
});
