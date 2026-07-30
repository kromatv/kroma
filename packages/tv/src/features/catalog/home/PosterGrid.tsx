import { PosterCard, VirtualGrid } from '@kroma/ui/kit';
import { memo } from 'react';

export interface GridCard {
  id: string;
  title: string;
  poster: string;
  colors: [string, string];
  watched?: boolean;
  progress?: number | null;
  onClick: () => void;
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

// A computed number rather than something measured, because scroll offsets
// are derived from it before anything is laid out; being a little out costs
// a slightly wrong resting position, not a broken grid.
const ROW_HEIGHT = Math.round((TILE_W * 3) / 2) + ROW_GAP;

// The 2:3 poster grid for the Films / Séries browse views. Virtualised: only the rows near the
// viewport are mounted, so a 2000-title library costs the same as a 40-title one.
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

// The grid owns the remaining height and is also what clips (see
// <VirtualGrid>): padding here would inset the clip and shave the rows.
const GRID_VIEWPORT = { flex: 1, minHeight: 0 } as const;

// Padding belongs on the content, not the viewport. `paddingTop` gives a
// focused row's ring and scale room to grow inside the clip, since
// <VirtualGrid> clips flush at its top.
const GRID_CONTENT = { paddingHorizontal: 64, paddingTop: 32 } as const;

const ROW = { gap: GAP } as const;
