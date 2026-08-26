// Netflix-style billboard: a tall rounded artwork card bleeding into the page
// background, with the title, a genre line and Play / My list actions.

import type { SectionItem } from '@kroma/core';
import { genreLabels, sizedImageUrl } from '@kroma/core';
import { Box, Button, styles, Text } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useGutters, useIsWide } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { radius, shades, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

export function HeroBillboard({ entry }: Readonly<{ entry: SectionItem }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { play: playNow } = usePlay();
  const { width, height } = useWindowDimensions();
  const gutters = useGutters();
  const queryClient = useQueryClient();

  const media = entry.type === 'movie' ? entry.item : entry.show;
  const id = media.id;
  const title = media.metadata?.title ?? media.title;
  const genres = genreLabels(t, media.metadata).slice(0, 3);
  const detailRoute = entry.type === 'movie' ? `/item/${id}` : `/show/${id}`;
  // Narrow portrait windows get the tall poster card; wide or landscape ones
  // get a backdrop (a landscape phone is wide but short; a poster would tower past it).
  const wide = useIsWide();
  const backdrop = wide || width > height;
  const poster =
    entry.type === 'movie' ? client.posterFor(entry.item) : client.showPosterFor(entry.show);
  const art = backdrop
    ? (sizedImageUrl(client.backdropFor(media), 1600) ?? sizedImageUrl(poster, 1600))
    : (sizedImageUrl(poster, 780) ?? sizedImageUrl(client.backdropFor(media), 780));

  const myList = useQuery({ queryKey: ['myList'], queryFn: () => client.myList() });
  const inList = (myList.data ?? []).includes(id);
  const toggleList = useMutation({
    mutationFn: () => (inList ? client.removeFromList(id) : client.addToList(id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['myList'] }),
  });

  const play = () => {
    // A movie plays (here or on the TV being driven); a show has no single file,
    // so it opens its page and the viewer picks the episode.
    if (entry.type === 'movie') void playNow(entry.item.id);
    else router.push(detailRoute as never);
  };

  // Both variants cap against the window HEIGHT so the billboard never
  // outgrows the viewport (landscape phones are ~390pt tall).
  const w = Math.min(width - gutters.left - gutters.right, backdrop ? 820 : 480);
  const h = backdrop
    ? Math.min(Math.round(w * 0.52), Math.round(height * 0.5))
    : Math.min(Math.round(w * 1.42), Math.round(height * 0.72));
  const ground = shades();

  return (
    <Box style={[s.wrap, { width: w, height: h }]}>
      <Pressable onPress={() => router.push(detailRoute as never)} style={StyleSheet.absoluteFill}>
        <FadeImage uri={art} seed={id} radius={radius.xl} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[ground.transparent, ground.transparent, ground.mid, ground.full]}
          locations={[0, 0.55, 0.78, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />
      </Pressable>
      <Box style={s.content} pointerEvents="box-none">
        <Text lines={2} style={s.title}>
          {title}
        </Text>
        {genres.length > 0 ? (
          <Text lines={1} style={s.genres}>
            {genres.join('  ·  ')}
          </Text>
        ) : null}
        <Box style={s.buttons}>
          <Button icon="player-play-filled" label={t('player.play')} style={s.cta} onPress={play} />
          <Button
            variant="outline"
            active={inList}
            icon={inList ? 'bookmark-filled' : 'bookmark'}
            label={t('nav.myList')}
            style={s.cta}
            onPress={() => toggleList.mutate()}
          />
        </Box>
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
  genres: { ...type.caption, color: 'text' },
  buttons: { row: true, self: 'center', gap: 10, w: '100%', maxW: 480, mt: 6 },
  cta: { flex: true },
});
