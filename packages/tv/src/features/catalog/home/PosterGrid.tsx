import { PosterCard, VirtualGrid } from '@kroma/ui/kit';
import { memo } from 'react';
import { SCREEN_PAD, STAGE_W } from '#tv/shared/stage';

export interface GridCard {
  id: string;
  title: string;
  /** Portrait art at the width of the cell the tile lands in: the column is
   *  measured, so the rendition asked for follows it. */
  poster: (width: number) => string;
  colors: [string, string];
  watched?: boolean;
  progress?: number | null;
  onClick: () => void;
  onFocus?: () => void;
}

// The design's column: 1792px of content is 8 x 203px tiles plus 7 x 24px gaps.
// As a MINIMUM rather than a count, so the exact design lands on a 1920 panel
// and a window of any other width fits whole tiles instead of clipping them.
const TILE_MIN = 203;
const POSTER_RATIO = 3 / 2;
const GAP = 24;
const ROW_GAP = 32;

/** The 2:3 poster grid for the Films / Séries browse views. Virtualised: only the rows near the
 * viewport are mounted, so a 2000-title library costs the same as a 40-title one. */
function PosterGridImpl({ cards }: Readonly<{ cards: GridCard[] }>) {
  return (
    <VirtualGrid
      data={cards}
      min={TILE_MIN}
      ratio={POSTER_RATIO}
      gap={GAP}
      rowGap={ROW_GAP}
      px={SCREEN_PAD}
      pt={32}
      width={STAGE_W}
      renderItem={(c, index, width) => (
        <PosterCard
          // The grid's entry point. tvOS picks by geometry and the web engine by
          // DOM order without one, so neither lands where the design says.
          autoFocus={index === 0}
          title={c.title}
          art={c.poster(width)}
          tint={c.colors}
          watched={c.watched}
          width={width}
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
