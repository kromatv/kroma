import { PosterCard, VirtualGrid } from '@kroma/ui/kit';
import { memo } from 'react';

export interface GridCard {
  id: string;
  title: string;
  poster: string;
  colors: [string, string];
  /** Whether the current user has marked this title watched. */
  watched?: boolean;
  /** Series-completion / resume progress (%), or null. */
  progress?: number | null;
  onClick: () => void;
  /** Fired when the tile takes focus (drives the browse screens' ambient header). */
  onFocus?: () => void;
}

// The 1920px stage makes the column maths static: 1792px of content is exactly
// 8 x 203px tiles plus 7 x 24px gaps. Flex wrap, never CSS grid, because the
// legacy webOS tier (Chromium 53) has no grid and React Native has none either.
const CONTENT_WIDTH = 1792;
const COLUMNS = 8;
const GAP = 24;
const ROW_GAP = 32;
const TILE_W = Math.floor((CONTENT_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS);

/**
 * The row pitch the virtualised grid scrolls by: the 2:3 poster at the computed
 * tile width (the title is drawn INSIDE it, so there is nothing below), plus the
 * gap under the row.
 *
 * It has to be a number rather than something measured, because it is what the
 * scroll offsets are computed from before anything is laid out. Being a little
 * out costs a slightly wrong resting scroll position, not a broken grid.
 */
const ROW_HEIGHT = Math.round((TILE_W * 3) / 2) + ROW_GAP;

/** The 2:3 poster grid for the Films / Séries browse views.
 *
 * Virtualised: only the rows near the viewport are mounted, so a 2000-title
 * library costs the same as a 40-title one. It used to render in growing chunks
 * of 120 that were never released, which meant the screen got heavier the
 * further you walked into it - and a library is exactly the screen people walk
 * to the end of. */
function PosterGridImpl({ cards }: Readonly<{ cards: GridCard[] }>) {
  return (
    <VirtualGrid
      data={cards}
      columns={COLUMNS}
      itemHeight={ROW_HEIGHT}
      style={GRID_VIEWPORT}
      contentStyle={GRID_CONTENT}
      rowStyle={ROW}
      renderItem={(c, index) => (
        <PosterCard
          // The grid's entry point. tvOS picks by geometry and the web engine by
          // DOM order without one, so neither lands where the design says.
          autoFocus={index === 0}
          title={c.title}
          art={c.poster}
          tint={c.colors}
          watched={c.watched}
          width={TILE_W}
          // GridCard carries a percentage (the server's series-completion
          // figure); <PosterCard> takes a 0..1 ratio.
          progress={c.progress == null ? null : c.progress / 100}
          onPress={c.onClick}
          onFocus={c.onFocus}
        />
      )}
    />
  );
}

// memo: the browse screens re-render on every focus move (the ambient header
// tracks the focused tile); an unchanged `cards` array must skip this subtree.
export const PosterGrid = memo(PosterGridImpl);

/** The grid owns the remaining height. It is also what CLIPS (see
 * <VirtualGrid>), which is why the padding is not here: on the viewport it would
 * inset the clip and shave the rows. */
const GRID_VIEWPORT = { flex: 1, minHeight: 0 } as const;

/** The padding belongs to the content the list translates.
 *
 * `paddingTop` is FOCUS_BLEED, and that is not a coincidence: <VirtualGrid> clips
 * flush at its top (the bleed there would show the row scrolled off it, over the
 * filter chips - see organisms/virtual/clip.ts), so the room a focused row's ring
 * and scale need has to come from INSIDE the content instead. The list parks the
 * focused row at the content origin, which this pushes 32px clear of the clip. */
const GRID_CONTENT = { paddingHorizontal: 64, paddingTop: 32 } as const;

/** A row: the gap between tiles. The vertical gap is part of ROW_HEIGHT, which
 * is what the list scrolls by. */
const ROW = { gap: GAP } as const;
