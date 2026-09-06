import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { genreSegment } from '@kroma/core';
import { Chip, Icon, IconButton, styles } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView } from 'react-native';
import { GenrePickerSheet } from '#mobile/components/GenrePickerSheet';
import type { TitleFilter } from '#mobile/lib/homeFilter';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { spacing } from '#mobile/lib/theme';

const CLEAR_DIAMETER = 36;

export function HomeFilterChips({
  filter,
  onFilter,
}: Readonly<{ filter: TitleFilter; onFilter: (next: TitleFilter) => void }>) {
  const t = useT();
  const router = useRouter();
  const gutters = useGutters();
  const genres = useRef<BottomSheetModal>(null);

  const choose = (next: TitleFilter) => {
    void Haptics.selectionAsync();
    onFilter(next);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.row, gutters.style]}
      >
        {filter === null ? null : (
          <IconButton
            variant="glass"
            diameter={CLEAR_DIAMETER}
            glyph={16}
            icon="x"
            label={t('content.clearFilter')}
            onPress={() => choose(null)}
          />
        )}
        {filter === 'show' ? null : (
          <Chip
            variant="outline"
            label={t('nav.films')}
            active={filter === 'movie'}
            pressed={filter === 'movie'}
            onPress={() => choose(filter === 'movie' ? null : 'movie')}
          />
        )}
        {filter === 'movie' ? null : (
          <Chip
            variant="outline"
            label={t('nav.series')}
            active={filter === 'show'}
            pressed={filter === 'show'}
            onPress={() => choose(filter === 'show' ? null : 'show')}
          />
        )}
        <Chip variant="outline" label={t('nav.genres')} onPress={() => genres.current?.present()}>
          <Icon name="chevron-down" size={14} thickness={2} color="text" />
        </Chip>
      </ScrollView>
      <GenrePickerSheet
        ref={genres}
        onPick={(slug) => {
          genres.current?.dismiss();
          router.push(`/genre/${genreSegment(slug)}` as never);
        }}
      />
    </>
  );
}

const s = styles({
  row: { row: true, align: 'center', gap: 8, pt: spacing.md },
});
