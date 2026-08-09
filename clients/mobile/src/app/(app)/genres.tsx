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
import { Box, styles, Txt } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeImage } from '#mobile/components/FadeImage';
import { PageHeader } from '#mobile/components/PageHeader';
import { Loading, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, SHADE, shade, spacing, type } from '#mobile/lib/theme';

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
  const insets = useSafeAreaInsets();

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

  // The surrounding <Screen> already consumed the horizontal safe-area insets
  // (landscape notch), so the tile math works on what is left of the window.
  const usable = width - insets.left - insets.right;
  const cols = usable >= 700 ? 3 : 2;
  const tileW = Math.floor((usable - spacing.md * 2 - 12 * (cols - 1)) / cols);

  return (
    <Screen padded={false}>
      <PageHeader title={t('nav.genres')} />
      <FlatList
        key={cols}
        data={tiles}
        numColumns={cols}
        keyExtractor={(g) => g.name}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={s.grid}
        renderItem={({ item: tile }) => (
          <Pressable
            onPress={() => router.push(`/genre/${encodeURIComponent(tile.name)}` as never)}
            style={({ pressed }) => [
              { width: tileW, height: tileW * 0.62, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Box style={s.tile}>
              <LinearGradient colors={tile.gradient} style={StyleSheet.absoluteFill} />
              {tile.art ? (
                <FadeImage uri={tile.art} seed={tile.name} style={StyleSheet.absoluteFill} />
              ) : null}
              <LinearGradient
                colors={[SHADE.transparent, SHADE.transparent, shade(0.85)]}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
              <Box style={s.tileCountPill}>
                <Txt style={s.tileCountText}>{tile.count}</Txt>
              </Box>
              <Box style={s.tileText}>
                <Txt lines={1} style={s.tileName}>
                  {tile.name}
                </Txt>
              </Box>
            </Box>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = styles({
  grid: { gap: 12, px: spacing.md, pb: spacing.xl },
  tile: { flex: true, bg: 'surface1', radius: radius.lg, overflow: 'hidden' },
  tileText: { absolute: true, right: 12, bottom: 10, left: 12 },
  tileName: { ...type.section, shrink: 1, fontSize: 16, fontWeight: '800' },
  tileCountPill: { absolute: true, top: 8, right: 8, px: 8, py: 2, bg: 'bg/60', radius: 999 },
  tileCountText: { ...type.small, color: 'text' },
});
