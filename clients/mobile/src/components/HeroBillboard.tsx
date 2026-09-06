import type { SectionItem } from '@kroma/client/media';
import { sizedImageUrl } from '@kroma/core';
import { ArtScrim, Box, Button, Icon, Progress, styles, Text } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { featuredMetaLine } from '#mobile/lib/featured';
import { useT } from '#mobile/lib/i18n';
import { useGutters, useIsWide } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

const HEIGHT_SHARE = 0.6;
const BACKDROP_RATIO = 0.56;
const POSTER_RATIO = 1.42;

export function HeroBillboard({
  entry,
  progress,
}: Readonly<{ entry: SectionItem; progress?: number | null }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { play: playNow } = usePlay();
  const { width, height } = useWindowDimensions();
  const wideWindow = useIsWide();
  const gutters = useGutters();
  const queryClient = useQueryClient();

  const media = entry.type === 'movie' ? entry.item : entry.show;
  const id = media.id;
  const title = media.metadata?.title ?? media.title;
  const detailRoute = entry.type === 'movie' ? `/item/${id}` : `/show/${id}`;
  const poster =
    entry.type === 'movie'
      ? client.media.artwork.posterFor(entry.item)
      : client.media.artwork.showPosterFor(entry.show);
  const backdrop = client.media.artwork.backdropFor(media);
  const landscape = backdrop !== null || wideWindow || width > height;
  const art = landscape
    ? (sizedImageUrl(backdrop, 1600) ?? sizedImageUrl(poster, 1600))
    : sizedImageUrl(poster, 780);

  const myListQuery = client.query.playback.myList();
  const myList = useQuery(myListQuery);
  const inList = (myList.data ?? []).includes(id);
  const toggleList = useMutation({
    mutationFn: () => (inList ? client.playback.removeFromList(id) : client.playback.addToList(id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myListQuery.queryKey }),
  });

  const play = () => {
    // A movie plays (here or on the TV being driven); a show has no single file,
    // so it opens its page and the viewer picks the episode.
    if (entry.type === 'movie') void playNow(entry.item.id);
    else router.push(detailRoute as never);
  };

  const w = Math.min(width - gutters.left - gutters.right, landscape ? 820 : 480);
  const h = Math.min(
    Math.round(w * (landscape ? BACKDROP_RATIO : POSTER_RATIO)),
    Math.round(height * HEIGHT_SHARE),
  );
  const meta = featuredMetaLine(t, entry);

  return (
    <Box style={[s.wrap, { width: w, height: h }]}>
      <Pressable onPress={() => router.push(detailRoute as never)} style={StyleSheet.absoluteFill}>
        <FadeImage uri={art} seed={id} radius={radius.xl} style={StyleSheet.absoluteFill} />
        <ArtScrim variant="deep" radius={radius.xl} />
      </Pressable>
      <Box style={s.content} pointerEvents="box-none">
        <Text lines={2} style={s.title}>
          {title}
        </Text>
        {meta ? (
          <Text lines={1} style={s.meta}>
            {meta}
          </Text>
        ) : null}
        <Box style={s.buttons}>
          <Button
            icon="player-play-filled"
            label={progress ? t('player.resume') : t('player.play')}
            style={s.play}
            onPress={play}
          />
          <Pressable
            onPress={() => toggleList.mutate()}
            style={({ pressed }) => [s.listAction, pressed && s.listActionPressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: inList }}
            accessibilityLabel={inList ? t('content.inList') : t('nav.myList')}
          >
            <Icon
              name={inList ? 'bookmark-filled' : 'bookmark'}
              size={24}
              thickness={2.2}
              color={inList ? 'accentText' : 'text'}
            />
            <Text lines={1} style={[s.listLabel, inList && s.listLabelActive]}>
              {inList ? t('content.inList') : t('nav.myList')}
            </Text>
          </Pressable>
        </Box>
        {progress ? (
          <Box style={s.progress}>
            <Progress value={progress} thickness={3} />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const s = styles({
  wrap: { self: 'center', mt: spacing.sm },
  content: {
    absolute: true,
    right: spacing.md,
    bottom: spacing.md,
    left: spacing.md,
    align: 'center',
    gap: 8,
  },
  title: {
    ...type.display,
    fontSize: 28,
    textAlign: 'center',
    textShadowColor: 'bg/85',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  meta: { ...type.caption, color: 'text' },
  buttons: { row: true, align: 'center', self: 'center', gap: 14, w: '100%', maxW: 480, mt: 6 },
  play: { flex: true },
  listAction: { align: 'center', gap: 3, minW: 64, py: 4 },
  listActionPressed: { opacity: 0.7 },
  listLabel: { ...type.small, color: 'textMuted' },
  listLabelActive: { color: 'accentText' },
  progress: { w: '100%', maxW: 480, mt: 2 },
});
