import {
  formatRuntime,
  type GenreCount,
  type MessageKey,
  qualityBadge,
  qualityBadgeForVideo,
  SORT_MODES,
  type SortMode,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Chip, Divider, qualityTone, Rail, styles, Txt } from '@kroma/ui/kit';
import { memo } from 'react';
import type { CatalogEntry } from '#tv/features/catalog/home/AmbientBackdrop';

const SORT_LABEL_KEY: Record<SortMode, MessageKey> = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
};

function entryLine(e: CatalogEntry, seasons: string | null): string {
  const mid = e.kind === 'movie' ? formatRuntime(e.item.durationMs) : seasons;
  const genres = e.item.metadata?.genres?.slice(0, 2) ?? [];
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
    <Box h={208} shrink={0} justify="flex-end" px={64} pb={8} style={{ zIndex: 1 }}>
      <Txt variant="overlineTv" color="accentText">
        {label}
        {hasItems ? <Txt variant="overlineTv" color="textDim">{` · ${count}`}</Txt> : null}
      </Txt>
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
      <Txt variant="hero" style={[s.echoTitle, { maxWidth: 960 }]} lines={1}>
        {entry.item.title}
      </Txt>
      <Box row align="center" gap={10}>
        {rating ? (
          <Txt style={{ fontSize: 15, fontWeight: '700' }} color="accentText">
            {`${rating.toFixed(1)}★`}
          </Txt>
        ) : null}
        <Txt style={{ fontSize: 15, fontWeight: '600' }} color="textMuted">
          {entryLine(entry, seasons)}
        </Txt>
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
  onGenre: (name: string | undefined) => void;
}>) {
  const t = useT();
  // A <Rail> rather than a ScrollView: it scrolls to FOLLOW focus. The children
  // must stay a FLAT list - a fragment reaches the rail as ONE tile and swallows
  // the genre chips into a single navigator node.
  return (
    // `grow={false}`: a growing rail showed only this strip's first eight chips.
    <Box style={{ zIndex: 1 }}>
      <Rail gap={8} inset={64} grow={false}>
        {SORT_MODES.map((mode) => (
          <Chip
            key={mode}
            variant="subtle"
            focusScale={1.06}
            active={mode === sort}
            label={t(SORT_LABEL_KEY[mode])}
            onPress={() => onSort(mode)}
          />
        ))}
        {genres.length > 0 ? (
          <Box key="divider" mx={4}>
            <Divider vertical size={1} color="rgba(255, 255, 255, 0.14)" />
          </Box>
        ) : null}
        {genres.length > 0 ? (
          <Chip
            key="all"
            variant="subtle"
            focusScale={1.06}
            active={!genre}
            label={t('browse.allGenres')}
            onPress={() => onGenre(undefined)}
          />
        ) : null}
        {genres.length > 0
          ? genres.map((g) => (
              <Chip
                key={g.name}
                variant="subtle"
                focusScale={1.06}
                active={g.name === genre}
                label={g.name}
                onPress={() => onGenre(g.name)}
              />
            ))
          : null}
      </Rail>
    </Box>
  );
};

// Memoised: the browse screen re-renders on every focus move (so, with a
// pointer, on every hover), and this strip depends on none of that.
export const BrowseFilters = memo(BrowseFiltersImpl);
