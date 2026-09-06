// The catalogue's masthead: the current view's best-rated backdrop fading into
// the ground, the heading over it, and one strip of filters under it.

import {
  type GenreCount,
  genreLabel,
  type MessageKey,
  SORT_MODES,
  type SortMode,
} from '@kroma/core';
import { Box, Chip, genreIcon, Icon, SORT_ICON, styles, Text } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { shades, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';
import { type PopoverAnchor, PopoverMenu } from './PopoverMenu';

const SORT_KEYS: Record<SortMode, MessageKey> = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
};

// Art above the heading, before the gradient takes over.
const ART_LEAD = 150;

export function CatalogueHeader({
  title,
  eyebrow,
  countText,
  backdrop,
  sort,
  onSort,
  genres,
  genre,
  onGenre,
  insetRight = 0,
}: Readonly<{
  title: string;
  eyebrow: string;
  countText?: string;
  backdrop: string | null;
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  genres: GenreCount[];
  genre: string | null;
  onGenre: (slug: string | null) => void;
  /** Room kept clear on the right, where the letter rail sits. */
  insetRight?: number;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const ground = shades();
  const sortButton = useRef<View>(null);
  const [sortAnchor, setSortAnchor] = useState<PopoverAnchor | null>(null);
  const openSort = () =>
    sortButton.current?.measureInWindow((x, y, width, height) =>
      setSortAnchor({ x, y, width, height }),
    );
  const strip = { paddingLeft: gutters.left, paddingRight: gutters.right + insetRight };

  return (
    <Box style={{ paddingTop: insets.top + (backdrop ? ART_LEAD : spacing.sm) }}>
      {backdrop ? (
        <Box pointerEvents="none" style={StyleSheet.absoluteFill}>
          <FadeImage uri={backdrop} seed={title} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[ground.transparent, ground.mid, ground.full]}
            locations={[0, 0.5, 0.82]}
            style={StyleSheet.absoluteFill}
          />
        </Box>
      ) : null}
      <Box style={[s.heading, strip]}>
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Box style={s.titleRow}>
          <Text style={s.title}>{title}</Text>
          {countText ? (
            <Box style={s.countPill}>
              <Text style={s.count}>{countText}</Text>
            </Box>
          ) : null}
        </Box>
      </Box>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.chipRow, strip]}
      >
        <Box ref={sortButton}>
          <Chip
            variant="subtle"
            icon={SORT_ICON[sort]}
            label={t(SORT_KEYS[sort])}
            onPress={openSort}
          >
            <Icon name="chevron-down" size={14} thickness={2} color="textMuted" />
          </Chip>
        </Box>
        {genres.length > 1 ? (
          <>
            <Box style={s.divider} />
            <Chip
              variant="subtle"
              label={t('browse.allGenres')}
              active={genre === null}
              onPress={() => onGenre(null)}
            />
            {genres.map((g) => (
              <Chip
                key={g.slug}
                variant="subtle"
                icon={genreIcon(g.slug)}
                label={genreLabel(t, g.name)}
                active={genre === g.slug}
                onPress={() => onGenre(genre === g.slug ? null : g.slug)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
      <PopoverMenu
        visible={sortAnchor !== null}
        anchor={sortAnchor}
        onClose={() => setSortAnchor(null)}
        items={SORT_MODES.map((mode) => ({
          key: mode,
          label: t(SORT_KEYS[mode]),
          active: mode === sort,
          onPress: () => onSort(mode),
        }))}
      />
    </Box>
  );
}

const s = styles({
  heading: { gap: 6, pb: spacing.md },
  eyebrow: { ...type.small, color: 'accent', textTransform: 'uppercase', letterSpacing: 1.2 },
  titleRow: { row: true, wrap: true, align: 'baseline', gap: 12 },
  title: { ...type.display, fontSize: 36 },
  countPill: { radius: 'pill', border: 'border', bg: 'tint/8', px: 12, py: 4 },
  count: { ...type.small, fontVariant: ['tabular-nums'] },
  chipRow: { row: true, align: 'center', gap: 8, pb: spacing.md },
  divider: { w: 1, h: 20, bg: 'border', mx: 2 },
});
