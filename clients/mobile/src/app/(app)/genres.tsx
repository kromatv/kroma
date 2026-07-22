// Genres: tiles built from the library's own metadata, each showing the best
// unused backdrop for that genre over its hue gradient (same helpers as TV).

import {
  collectGenres,
  genreColors,
  genreShowcases,
  type MediaItem,
  type Show,
  sizedImageUrl,
} from '@kroma/core';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FadeImage } from '../../components/FadeImage';
import { PageHeader } from '../../components/PageHeader';
import { Loading, Screen } from '../../components/ui';
import { useT } from '../../lib/i18n';
import { useClient } from '../../lib/session';
import { colors, radius, SHADE, spacing, type } from '../../lib/theme';

interface GenreTileModel {
  name: string;
  count: number;
  art: string | null;
  gradient: [string, string];
}

export default function Genres() {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const catalogue = useQuery({
    queryKey: ['genreCatalogue'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(MediaItem | Show)[]> => {
      const [movies, shows] = await Promise.all([client.movies(), client.shows()]);
      return [...movies, ...shows];
    },
  });

  if (catalogue.isPending) return <Loading label={t('common.loading')} />;

  const items = catalogue.data ?? [];
  const showcases = genreShowcases(items);
  const tiles: GenreTileModel[] = collectGenres(items).map((g) => {
    const showcase = showcases.get(g.name);
    return {
      name: g.name,
      count: g.count,
      art: sizedImageUrl(client.resolveArt(showcase?.metadata?.backdropUrl), 480),
      gradient: genreColors(g.name),
    };
  });

  const cols = width >= 700 ? 3 : 2;
  const tileW = Math.floor((width - spacing.md * 2 - 12 * (cols - 1)) / cols);

  return (
    <Screen padded={false}>
      <PageHeader title={t('nav.genres')} />
      <FlatList
        key={cols}
        data={tiles}
        numColumns={cols}
        keyExtractor={(g) => g.name}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={styles.grid}
        renderItem={({ item: tile }) => (
          <Pressable
            onPress={() => router.push(`/genre/${encodeURIComponent(tile.name)}` as never)}
            style={({ pressed }) => [
              { width: tileW, height: tileW * 0.62, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={styles.tile}>
              <LinearGradient colors={tile.gradient} style={StyleSheet.absoluteFill} />
              {tile.art ? (
                <FadeImage uri={tile.art} seed={tile.name} style={StyleSheet.absoluteFill} />
              ) : null}
              <LinearGradient
                colors={[SHADE.transparent, SHADE.transparent, 'rgba(10, 10, 12, 0.85)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.tileCountPill}>
                <Text style={styles.tileCountText}>{tile.count}</Text>
              </View>
              <View style={styles.tileText}>
                <Text numberOfLines={1} style={styles.tileName}>
                  {tile.name}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: 12 },
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tileText: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  tileName: { ...type.section, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  tileCountPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10, 10, 12, 0.6)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tileCountText: { ...type.small, color: colors.text },
});
