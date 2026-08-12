// <Grid>: the tile grid of the browse screens.
//
// React Native has no CSS grid (and neither does the legacy webOS tier this app
// still ships to), so the columns are computed and the children laid out with
// flex wrap. Each cell gets an explicit width, which is also what lets a
// <PosterCard> simply fill its cell.
//
// The grid also DECLARES its rows to the spatial navigator. Wrapping is a
// visual arrangement, not a navigational one: without the declaration the whole
// grid is one long line and Down from the first tile walks to the second rather
// than to the tile underneath it.

import { Children, type ReactNode, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { FocusRegion } from '#ui/lib/focus-scope';
import { FocusLine } from '#ui/lib/focus-scroll';

interface GridProps {
  /** The narrowest a cell may be. The grid measures itself and fits as many
   *  cells as the room allows, the way `auto-fill` does in CSS. */
  min?: number;
  /** A fixed count, for a design that demands one whatever the width. Wins
   *  over `min`. */
  columns?: number;
  /** The width to divide, when the caller already knows it. Omit and the grid
   *  measures its own box, which costs one frame before the first paint. */
  width?: number;
  /** Horizontal gap, which is also what the column maths removes. */
  gap?: number;
  /** Vertical gap. Defaults to `gap`; the browse grids run looser vertically so
   *  the rows read as rows rather than as one field of tiles. */
  rowGap?: number;
  children: ReactNode;
}

/** The width of one cell in a `columns`-wide grid of `width`, with `gap`
 * between cells. Exported so a caller can size its own art requests to match. */
function cellWidth(width: number, columns: number, gap: number): number {
  if (columns <= 0) return width;
  return Math.floor((width - gap * (columns - 1)) / columns);
}

/** How many `min`-wide cells fit in `width`. At least one, so a container
 * narrower than a single cell still renders it rather than nothing. */
function columnsFor(width: number, min: number, gap: number): number {
  if (min <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

function Grid({ min, columns, width, gap = 24, rowGap, children }: Readonly<GridProps>) {
  const [measured, setMeasured] = useState(0);
  // Both the cell width and an auto-fill count need the room, so a grid that was
  // not handed one paints nothing until it has measured itself.
  const room = width ?? measured;
  const count = columns ?? (min ? columnsFor(room, min, gap) : 1);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  };

  return (
    <Box gap={rowGap ?? gap} onLayout={width === undefined ? onLayout : undefined}>
      {room > 0 ? lines(children, count, cellWidth(room, count, gap), gap) : null}
    </Box>
  );
}

function lines(children: ReactNode, count: number, cell: number, gap: number): ReactNode[] {
  const cells = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let at = 0; at < cells.length; at += count) rows.push(cells.slice(at, at + count));
  return rows.map((row, index) => (
    // Each line is also the page's scroll anchor (see <FocusLine>): inside
    // a <FocusSlot> taller than the screen, the page would otherwise pin
    // the slot's top once and never follow the focus down the grid.
    // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the row's identity.
    <FocusLine key={index}>
      <FocusRegion style={{ flexDirection: 'row', gap }}>
        {row.map((child, column) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the cell's slot in the row.
          <Box key={column} w={cell}>
            {child}
          </Box>
        ))}
      </FocusRegion>
    </FocusLine>
  ));
}

export type { GridProps };
export { cellWidth, columnsFor, Grid };
