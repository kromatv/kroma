import { sizedImageUrl } from '@kromatv/core';
import {
  AgeRating,
  ArtScrim,
  Box,
  Button,
  Icon,
  Progress,
  styles,
  Text,
  typeSpec as textRoles,
  useStyles,
} from '@kromatv/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { featuredAgeRating, featuredMetaLine } from '#mobile/lib/featured';
import type { HomeEntry } from '#mobile/lib/home-sections';
import { useT } from '#mobile/lib/i18n';
import { useGutters, useIsWide } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play.hook';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './fade-image.component';

const HEIGHT_SHARE = 0.6;
const BACKDROP_RATIO = 0.56;
const POSTER_RATIO = 1.42;

/** The title a home opens on. `note` is the line over its title saying why it
 *  is there, left out when the server gave none. */
export function HeroBillboard({
  entry,
  progress,
  note,
}: Readonly<{ entry: HomeEntry; progress?: number | null; note?: string | null }>) {
  const s = useStyles(sDefinition);

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
    if (entry.type === 'movie') {
      void playNow(entry.item.id);
    } else {
      router.push(detailRoute);
    }
  };

  const w = Math.min(width - gutters.left - gutters.right, landscape ? 820 : 480);
  const h = Math.min(
    Math.round(w * (landscape ? BACKDROP_RATIO : POSTER_RATIO)),
    Math.round(height * HEIGHT_SHARE),
  );
  const meta = featuredMetaLine(t, entry);
  const ageRating = featuredAgeRating(entry);

  return (
    <Box style={[s.wrap, { width: w, height: h }]}>
      <Pressable onPress={() => router.push(detailRoute)} style={StyleSheet.absoluteFill}>
        <FadeImage uri={art} seed={id} radius={radius.xl} style={StyleSheet.absoluteFill} />
        <ArtScrim variant="deep" radius={radius.xl} />
      </Pressable>
      <Box style={s.content} pointerEvents="box-none">
        {note ? (
          <Text lines={1} style={s.note}>
            {note}
          </Text>
        ) : null}
        <Text lines={2} style={s.title}>
          {title}
        </Text>
        <Box style={s.facts}>
          <AgeRating rating={ageRating} tone="art" />
          {meta ? (
            <Text lines={1} style={s.meta}>
              {meta}
            </Text>
          ) : null}
        </Box>
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
              color={inList ? 'accentText' : 'white'}
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

const ON_ART = {
  textAlign: 'center',
  textShadowColor: 'black/85',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 10,
} as const;

const sDefinition = styles({
  wrap: { self: 'center', mt: spacing.sm },
  content: {
    absolute: true,
    right: spacing.md,
    bottom: spacing.md,
    left: spacing.md,
    align: 'center',
    gap: 8,
  },
  note: {
    ...type.caption,
    ...ON_ART,
    color: 'accentText',
    fontWeight: '700',
  },
  title: {
    ...type.display,
    ...ON_ART,
    color: 'white',
    fontSize: textRoles.subheadingTv.size,
  },
  meta: { ...type.caption, color: 'white/82', shrink: 1 },
  facts: { row: true, align: 'center', self: 'center', gap: 8, maxW: '100%' },
  buttons: { row: true, align: 'center', self: 'center', gap: 14, w: '100%', maxW: 480, mt: 6 },
  play: { flex: true },
  listAction: { align: 'center', gap: 3, minW: 64, py: 4 },
  listActionPressed: { opacity: 0.7 },
  listLabel: { ...type.small, color: 'white/70' },
  listLabelActive: { color: 'accentText' },
  progress: { w: '100%', maxW: 480, mt: 2 },
});
