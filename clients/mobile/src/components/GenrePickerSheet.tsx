import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import type { MediaItem, Show } from '@kroma/client/media';
import { collectGenres, type GenreCount, genreLabel } from '@kroma/core';
import { Box, genreIcon, Icon, styles, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { forwardRef, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loading, SheetTitle, sheetChrome } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

const SNAP_POINTS = ['70%'];
const COLUMNS = 2;

export const GenrePickerSheet = forwardRef<
  BottomSheetModal,
  Readonly<{ onPick: (slug: string) => void }>
>(function GenrePickerSheet({ onPick }, ref) {
  const t = useT();
  const client = useClient();
  const insets = useSafeAreaInsets();
  const [asked, setAsked] = useState(false);

  const catalogue = useQuery({
    queryKey: ['genreCatalogue'],
    enabled: asked,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(MediaItem | Show)[]> => {
      const [movies, shows] = await Promise.all([client.media.movies(), client.media.shows()]);
      return [...movies, ...shows];
    },
  });
  const genres = useMemo(() => collectGenres(catalogue.data ?? []), [catalogue.data]);

  return (
    <BottomSheetModal
      ref={ref}
      {...sheetChrome()}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onChange={(index) => {
        if (index >= 0) setAsked(true);
      }}
    >
      <Box style={s.header}>
        <SheetTitle>{t('nav.genres')}</SheetTitle>
      </Box>
      {catalogue.isPending ? (
        <Loading label={t('common.loading')} />
      ) : (
        <BottomSheetFlatList
          data={genres}
          keyExtractor={(genre: GenreCount) => genre.slug}
          numColumns={COLUMNS}
          columnWrapperStyle={s.row}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.lg }]}
          renderItem={({ item }: { item: GenreCount }) => (
            <Pressable
              onPress={() => onPick(item.slug)}
              style={({ pressed }) => [s.tile, pressed && s.tilePressed]}
              accessibilityRole="button"
            >
              <Box style={s.well}>
                <Icon
                  name={genreIcon(item.slug) ?? 'category'}
                  size={18}
                  thickness={1.9}
                  color="accentText"
                />
              </Box>
              <Box style={s.names}>
                <Text lines={1} style={s.label}>
                  {genreLabel(t, item.name)}
                </Text>
                <Text style={s.count}>{item.count}</Text>
              </Box>
            </Pressable>
          )}
        />
      )}
    </BottomSheetModal>
  );
});

const s = styles({
  header: { px: spacing.md, pt: spacing.sm },
  list: { px: spacing.md, gap: 10 },
  row: { gap: 10 },
  tile: {
    row: true,
    align: 'center',
    flex: true,
    gap: 10,
    minH: 56,
    px: 10,
    bg: 'surface3',
    radius: radius.md,
  },
  tilePressed: { bg: 'surface1' },
  well: { center: true, w: 34, h: 34, bg: 'accentSoft', radius: 10 },
  names: { shrink: 1 },
  label: { ...type.body, fontWeight: '600' },
  count: { ...type.small },
});
