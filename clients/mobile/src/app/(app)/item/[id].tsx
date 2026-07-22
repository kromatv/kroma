// Movie / episode detail: cinematic hero, Netflix-style action block, genre
// chips, cast and similar rails.

import {
  formatRuntime,
  formatTimecode,
  type MediaItem,
  type ProgressEntry,
  qualityBadge,
  sizedImageUrl,
} from '@kroma/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { MediaRail, movieCard } from '#mobile/components/cards';
import { CastRail, DetailActions, DetailHero, MetaBadge } from '#mobile/components/detail';
import { Chip, ErrorView, ExpandableText, Loading, SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { SplitColumns } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { colors, posterWidth, spacing, type } from '#mobile/lib/theme';

/** Show + "S01E02" line above an episode's title; movies have no context. */
function episodeContext(media: MediaItem): string | undefined {
  if (media.kind !== 'episode' || !media.showTitle) return undefined;
  const numbering =
    media.season != null && media.episode != null ? ` · S${media.season}E${media.episode}` : '';
  return `${media.showTitle}${numbering}`;
}

/** Saved position worth resuming from (anything under 30s starts over). */
function resumeSeconds(progress: ProgressEntry | null | undefined): number {
  return progress && progress.positionMs > 30_000 ? progress.positionMs / 1000 : 0;
}

function reportPath(media: MediaItem, title: string): string {
  const kind = media.kind === 'episode' ? 'episode' : 'movie';
  return `/report/${media.id}?kind=${kind}&title=${encodeURIComponent(title)}`;
}

/** Year / runtime / quality / HDR / rating strip under the hero title. */
function ItemMeta({ media }: Readonly<{ media: MediaItem }>) {
  const runtime = formatRuntime(media.durationMs);
  const badge = qualityBadge(media);
  const rating = media.metadata?.rating;
  return (
    <>
      {media.year ? <Text style={styles.metaText}>{media.year}</Text> : null}
      {runtime ? <Text style={styles.metaText}>{runtime}</Text> : null}
      {badge ? <MetaBadge>{badge}</MetaBadge> : null}
      {media.video?.hdr ? <MetaBadge>HDR</MetaBadge> : null}
      {rating ? <Text style={styles.rating}>★ {rating.toFixed(1)}</Text> : null}
    </>
  );
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const item = useQuery({ queryKey: ['item', id], queryFn: () => client.item(id) });
  const progress = useQuery({
    queryKey: ['progress', id],
    queryFn: () => client.itemProgress(id),
    staleTime: 15_000,
  });
  const myList = useQuery({ queryKey: ['myList'], queryFn: () => client.myList() });
  const watchedIds = useQuery({ queryKey: ['watched'], queryFn: () => client.watched() });
  const similar = useQuery({
    queryKey: ['similar', id],
    queryFn: () => client.similar(id),
    staleTime: 10 * 60_000,
  });

  const inList = (myList.data ?? []).includes(id);
  const toggleList = useMutation({
    mutationFn: () => (inList ? client.removeFromList(id) : client.addToList(id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['myList'] }),
  });
  const isWatched = (watchedIds.data ?? []).includes(id);
  const toggleWatched = useMutation({
    mutationFn: () => (isWatched ? client.unmarkWatched(id) : client.markWatched(id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['watched'] }),
  });

  if (item.isPending) return <Loading label={t('common.loading')} />;
  if (item.isError)
    return (
      <ErrorView
        message={t('error.serverBody')}
        retryLabel={t('error.retry')}
        onRetry={() => item.refetch()}
      />
    );

  const media = item.data;
  const backdrop = sizedImageUrl(
    client.backdropFor(media) ?? client.posterFor(media),
    Math.min(1280, width * 2),
  );
  const title = media.metadata?.title ?? media.title;
  const resumeSec = resumeSeconds(progress.data);
  const cardW = posterWidth(width);
  const cast = media.metadata?.cast ?? [];

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
        seed={media.id}
        title={title}
        context={episodeContext(media)}
        meta={<ItemMeta media={media} />}
      />

      {/* Tablets: actions column beside the overview column. */}
      <SplitColumns
        style={styles.body}
        left={
          <DetailActions
            playLabel={
              resumeSec > 0
                ? t('player.resumeAt', { time: formatTimecode(resumeSec) })
                : t('player.play')
            }
            onPlay={() => router.push(`/player/${media.id}` as never)}
            inList={inList}
            onToggleList={() => toggleList.mutate()}
            watched={isWatched}
            onToggleWatched={() => toggleWatched.mutate()}
            onReport={() => router.push(reportPath(media, title) as never)}
            item={media}
          />
        }
        right={
          <>
            {media.metadata?.overview ? (
              <ExpandableText>{media.metadata.overview}</ExpandableText>
            ) : null}
            {media.metadata?.genres?.length ? (
              <View style={styles.genreRow}>
                {media.metadata.genres.slice(0, 4).map((genre) => (
                  <Chip
                    key={genre}
                    label={genre}
                    onPress={() => router.push(`/genre/${encodeURIComponent(genre)}` as never)}
                  />
                ))}
              </View>
            ) : null}
          </>
        }
      />

      {cast.length > 0 ? (
        <View>
          <SectionTitle>{t('content.cast')}</SectionTitle>
          <CastRail cast={cast} />
        </View>
      ) : null}

      {similar.data?.length ? (
        <View>
          <SectionTitle>{t('content.similarTitles')}</SectionTitle>
          <MediaRail cards={similar.data.map((m) => movieCard(m, client, cardW))} />
        </View>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  metaText: { ...type.caption, color: colors.text, fontWeight: '600' },
  rating: { ...type.caption, color: colors.accent, fontWeight: '700' },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
