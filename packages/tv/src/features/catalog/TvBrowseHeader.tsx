import {
  formatRuntime,
  type GenreCount,
  genreLabel,
  genreLabels,
  type MessageKey,
  qualityBadge,
  qualityBadgeForVideo,
  SORT_MODES,
  type SortMode,
  type Translate,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Chip, Divider, qualityTone, Rail, styles, Text } from '@kroma/ui/kit';
import { memo } from 'react';
import type { CatalogEntry } from '#tv/features/catalog/home/AmbientBackdrop';

const SORT_LABEL_KEY: Record<SortMode, MessageKey> = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
};

function entryLine(t: Translate, e: CatalogEntry, seasons: string | null): string {
  const mid = e.kind === 'movie' ? formatRuntime(e.item.durationMs) : seasons;
  const genres = genreLabels(t, e.item.metadata).slice(0, 2);
  return [e.item.year ? String(e.item.year) : null, mid, ...genres].filter(Boolean).join(' · ');
}

function entryBadge(e: CatalogEntry): string | null {
  return e.kind === 'movie' ? qualityBadge(e.item) : qualityBadgeForVideo(e.item.video);
}

const s = styles({
  // The design's clamp(30px, 4.8vh, 46px), resolved: on the fixed 1920x1080
  // stage a viewport unit would mean something different on each of the four
  // targets.
  echoTitle: { fontSize: 46, lineHeight: 48, fontWeight: '700', letterSpacing: -0.92 },
});

/** Fixed height, so the grid never reflows as the focus echo swaps titles. */
export function BrowseHeader({
  label,
  count,
  hasItems,
  focused,
}: Readonly<{
  label: string;
  count: number;
  hasItems: boolean;
  focused: CatalogEntry | null;
}>) {
  return (
    // `zIndex`: the poster grid is a LATER sibling and its clip box bleeds
    // FOCUS_BLEED (32px) past its bounds to clear a focused tile's ring
    // (organisms/virtual/clip.ts), which would otherwise paint over this chrome.
    <Box h={208} shrink={0} justify="flex-end" px={64} pb={8} z={1}>
      <Text variant="overlineTv" color="accentText">
        {label}
        {hasItems ? <Text variant="overlineTv" color="textDim">{` · ${count}`}</Text> : null}
      </Text>
      {focused ? <FocusEcho entry={focused} /> : null}
    </Box>
  );
}

function FocusEcho({ entry }: Readonly<{ entry: CatalogEntry }>) {
  const t = useT();
  const rating = entry.item.metadata?.rating;
  const badge = entryBadge(entry);
  const seasons =
    entry.kind === 'show' ? t('content.seasonCount', { count: entry.item.seasonCount }) : null;
  return (
    <Box mt={8} gap={6}>
      <Text variant="hero" style={[s.echoTitle, { maxWidth: 960 }]} lines={1}>
        {entry.item.title}
      </Text>
      <Box row align="center" gap={10}>
        {rating ? (
          <Text variant="strongTv" color="accentText">
            {`${rating.toFixed(1)}★`}
          </Text>
        ) : null}
        <Text variant="labelTv" color="textMuted">
          {entryLine(t, entry, seasons)}
        </Text>
        {badge ? <Badge tone={qualityTone(badge)}>{badge}</Badge> : null}
      </Box>
    </Box>
  );
}

const BrowseFiltersImpl = function BrowseFilters({
  sort,
  onSort,
  genres,
  genre,
  onGenre,
}: Readonly<{
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  genres: GenreCount[];
  genre: string | undefined;
  onGenre: (slug: string | undefined) => void;
}>) {
  const t = useT();
  // A <Rail.Root> rather than a ScrollView: it scrolls to FOLLOW focus. The children
  // must stay a FLAT list - a fragment reaches the rail as ONE tile and swallows
  // the genre chips into a single navigator node.
  return (
    // `grow={false}`: a growing rail showed only this strip's first eight chips.
    <Box z={1}>
      <Rail.Root gap={8} inset={64} grow={false}>
        {SORT_MODES.map((mode) => (
          <Chip
            key={mode}
            variant="subtle"
            focusScale={1.06}
            active={mode === sort}
            pressed={mode === sort}
            label={t(SORT_LABEL_KEY[mode])}
            onPress={() => onSort(mode)}
          />
        ))}
        {genres.length > 0 ? (
          <Box key="divider" mx={4}>
            <Divider vertical thickness={1} color="borderStrong" />
          </Box>
        ) : null}
        {genres.length > 0 ? (
          <Chip
            key="all"
            variant="subtle"
            focusScale={1.06}
            active={!genre}
            pressed={!genre}
            label={t('browse.allGenres')}
            onPress={() => onGenre(undefined)}
          />
        ) : null}
        {genres.length > 0
          ? genres.map((g) => (
              <Chip
                key={g.slug}
                variant="subtle"
                focusScale={1.06}
                active={g.slug === genre}
                pressed={g.slug === genre}
                label={genreLabel(t, g.name)}
                onPress={() => onGenre(g.slug)}
              />
            ))
          : null}
      </Rail.Root>
    </Box>
  );
};

// Memoised: the browse screen re-renders on every focus move (so, with a
// pointer, on every hover), and this strip depends on none of that.
export const BrowseFilters = memo(BrowseFiltersImpl);
