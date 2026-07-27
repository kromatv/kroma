// <Grid>: the fixed-column tile grid of the browse screens.
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

import { Children, type ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { FocusRegion } from '#ui/lib/focus-scope';
import { FocusLine } from '#ui/lib/focus-scroll';

interface GridProps {
  /** Total width available to the grid, gutters included. */
  width: number;
  columns: number;
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

function Grid({ width, columns, gap = 24, rowGap, children }: Readonly<GridProps>) {
  const cell = cellWidth(width, columns, gap);
  const cells = Children.toArray(children);
  const lines: ReactNode[][] = [];
  for (let at = 0; at < cells.length; at += columns) lines.push(cells.slice(at, at + columns));
  return (
    <Box gap={rowGap ?? gap}>
      {lines.map((line, index) => (
        // Each line is also the page's scroll anchor (see <FocusLine>): inside
        // a <FocusSlot> taller than the screen, the page would otherwise pin
        // the slot's top once and never follow the focus down the grid.
        // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the row's identity.
        <FocusLine key={index}>
          <FocusRegion style={{ flexDirection: 'row', gap }}>
            {line.map((child, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the cell's slot in the row.
              <Box key={column} w={cell}>
                {child}
              </Box>
            ))}
          </FocusRegion>
        </FocusLine>
      ))}
    </Box>
  );
}

export type { GridProps };
export { cellWidth, Grid };
