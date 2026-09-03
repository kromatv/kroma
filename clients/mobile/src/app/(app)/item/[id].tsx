// Movie / episode detail: cinematic hero, Netflix-style action block, genre
// chips, cast and similar rails.

import { ItemId, type MediaItem, type ProgressEntry } from '@kroma/client/media';
import {
  episodeTag,
  formatRuntime,
  formatTimecode,
  qualityBadge,
  sizedImageUrl,
  type Translate,
} from '@kroma/core';
import { Box, styles, Text } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { MediaRail, movieCard } from '#mobile/components/cards';
import {
  CastRail,
  DetailActions,
  DetailHero,
  GenreChips,
  MetaBadge,
} from '#mobile/components/detail';
import { ErrorView, ExpandableText, Loading, SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { SplitColumns, useGutters } from '#mobile/lib/layout';
import { routeParam } from '#mobile/lib/nav';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { posterWidth, spacing, type } from '#mobile/lib/theme';

function episodeContext(media: MediaItem): string | undefined {
  if (media.kind !== 'episode' || !media.showTitle) return undefined;
  const numbering = episodeTag(media);
  return numbering ? `${media.showTitle} · ${numbering}` : media.showTitle;
}

const RESUME_THRESHOLD_MS = 30_000;

function resumeSeconds(progress: ProgressEntry | null | undefined): number {
  return progress && progress.positionMs > RESUME_THRESHOLD_MS ? progress.positionMs / 1000 : 0;
}

// With a TV connected, Play stops meaning "here": the label says where it will land.
function playLabel(t: Translate, device: string | undefined, resumeSec: number): string {
  if (device) return t('cast.playOn', { device });
  if (resumeSec > 0) return t('player.resumeAt', { time: formatTimecode(resumeSec) });
  return t('player.play');
}

function reportPath(media: MediaItem, title: string): string {
  const kind = media.kind === 'episode' ? 'episode' : 'movie';
  return `/report/${media.id}?kind=${kind}&title=${encodeURIComponent(title)}`;
}

function ItemMeta({ media }: Readonly<{ media: MediaItem }>) {
  const runtime = formatRuntime(media.durationMs);
  const badge = qualityBadge(media);
  const rating = media.metadata?.rating;
  return (
    <>
      {media.year ? <Text style={s.metaText}>{media.year}</Text> : null}
      {runtime ? <Text style={s.metaText}>{runtime}</Text> : null}
      {badge ? <MetaBadge>{badge}</MetaBadge> : null}
      {media.video?.hdr ? <MetaBadge>HDR</MetaBadge> : null}
      {rating ? <Text style={s.rating}>★ {rating.toFixed(1)}</Text> : null}
    </>
  );
}

export default function ItemRoute() {
  const id = routeParam(useLocalSearchParams<{ id?: string }>().id);
  return id ? <ItemDetail id={ItemId.parse(id)} /> : <Redirect href="/" />;
}

function ItemDetail({ id }: Readonly<{ id: ItemId }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { play, device } = usePlay();
  const { width } = useWindowDimensions();
  const gutters = useGutters();
  const queryClient = useQueryClient();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const item = useQuery(client.query.media.item(id));
  const progress = useQuery({ ...client.query.playback.itemProgress(id), staleTime: 15_000 });
  const myListQuery = client.query.playback.myList();
  const watchedQuery = client.query.playback.watched();
  const myList = useQuery(myListQuery);
  const watchedIds = useQuery(watchedQuery);
  const similar = useQuery({ ...client.query.media.similar(id), staleTime: 10 * 60_000 });

  const inList = (myList.data ?? []).includes(id);
  const toggleList = useMutation({
    mutationFn: () => (inList ? client.playback.removeFromList(id) : client.playback.addToList(id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myListQuery.queryKey }),
  });
  const isWatched = (watchedIds.data ?? []).includes(id);
  const toggleWatched = useMutation({
    mutationFn: () =>
      isWatched ? client.playback.unmarkWatched(id) : client.playback.markWatched(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: watchedQuery.queryKey }),
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
    client.media.artwork.backdropFor(media) ?? client.media.artwork.posterFor(media),
    Math.min(1280, width),
  );
  const title = media.metadata?.title ?? media.title;
  const resumeSec = resumeSeconds(progress.data);
  const cardW = posterWidth(width);
  const cast = media.metadata?.cast ?? [];

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
        seed={media.id}
        title={title}
        context={episodeContext(media)}
        meta={<ItemMeta media={media} />}
      />

      {/* Tablets: actions column beside the overview column. */}
      <SplitColumns
        style={[s.body, gutters.style]}
        left={
          <DetailActions
            playLabel={playLabel(t, device?.name, resumeSec)}
            onPlay={() => void play(media.id, resumeSec * 1000)}
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
            <GenreChips meta={media.metadata} />
          </>
        }
      />

      {cast.length > 0 ? (
        <Box>
          <SectionTitle>{t('content.cast')}</SectionTitle>
          <CastRail cast={cast} />
        </Box>
      ) : null}

      {similar.data?.length ? (
        <Box>
          <SectionTitle>{t('content.similarTitles')}</SectionTitle>
          <MediaRail cards={similar.data.map((m) => movieCard(m, client, cardW))} />
        </Box>
      ) : null}
    </Animated.ScrollView>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  body: { gap: spacing.md, pt: spacing.md },
  metaText: { ...type.caption, color: 'text', fontWeight: '600' },
  rating: { ...type.caption, color: 'accentText', fontWeight: '700' },
});
