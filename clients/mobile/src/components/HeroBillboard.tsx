// Netflix-style billboard: a tall rounded artwork card bleeding into the page
// background, with the title, a genre line and Play / My list actions.

import type { SectionItem } from '@kroma/core';
import { sizedImageUrl } from '@kroma/core';
import { Button } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useGutters, useIsWide } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { colors, radius, SHADE, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

export function HeroBillboard({ entry }: Readonly<{ entry: SectionItem }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const gutters = useGutters();
  const queryClient = useQueryClient();

  const media = entry.type === 'movie' ? entry.item : entry.show;
  const id = media.id;
  const title = media.metadata?.title ?? media.title;
  const genres = media.metadata?.genres?.slice(0, 3) ?? [];
  const detailRoute = entry.type === 'movie' ? `/item/${id}` : `/show/${id}`;
  // Narrow portrait windows get the tall poster card; wide OR landscape ones a
  // backdrop billboard (a landscape phone is wide but short - a poster card
  // would tower past the viewport).
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
    if (entry.type === 'movie') router.push(`/player/${entry.item.id}` as never);
    else router.push(detailRoute as never);
  };

  // Both variants cap against the window HEIGHT so the billboard never
  // outgrows the viewport (landscape phones are ~390pt tall).
  const w = Math.min(width - gutters.left - gutters.right, backdrop ? 820 : 480);
  const h = backdrop
    ? Math.min(Math.round(w * 0.52), Math.round(height * 0.5))
    : Math.min(Math.round(w * 1.42), Math.round(height * 0.72));

  return (
    <View style={[styles.wrap, { width: w, height: h }]}>
      <Pressable onPress={() => router.push(detailRoute as never)} style={StyleSheet.absoluteFill}>
        <FadeImage uri={art} seed={id} radius={radius.xl} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[SHADE.transparent, SHADE.transparent, SHADE.mid, SHADE.full]}
          locations={[0, 0.55, 0.78, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />
      </Pressable>
      <View style={styles.content} pointerEvents="box-none">
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {genres.length > 0 ? (
          <Text numberOfLines={1} style={styles.genres}>
            {genres.join('  ·  ')}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button
            icon="player-play-filled"
            label={t('player.play')}
            style={styles.cta}
            onPress={play}
          />
          <Button
            variant="outline"
            active={inList}
            icon={inList ? 'check' : 'plus'}
            label={t('nav.myList')}
            style={styles.cta}
            onPress={() => toggleList.mutate()}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', marginTop: spacing.sm },
  content: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...type.display,
    fontSize: 28,
    textAlign: 'center',
    textShadowColor: 'rgba(10, 10, 12, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  genres: { ...type.caption, color: colors.text },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
  },
  cta: { flex: 1 },
});
