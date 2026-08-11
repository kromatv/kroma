// The catalogue's poster grid. The kit's <Grid> lays the cells out; this
// measures the row so every tile can be handed the width of the cell it lands
// in, which is what a web <Poster> needs to size its own art request.

import { Box, cellWidth, columnsFor, Grid } from '@kroma/ui/kit';
import { Children, type ReactNode, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

const CARD_MIN = 132;
const CARD_MAX = 208;
const GAP = 18;
const ROW_GAP = 24;

// A third of a narrow row, never below the phone minimum, capped at the
// catalogue's card width once there is room for it.
function tileMin(room: number): number {
  return Math.min(CARD_MAX, Math.max(CARD_MIN, Math.round(room / 3)));
}

export interface TileGridProps {
  /** The tiles, given the pixel width of the cell each one lands in. */
  children: (width: number) => ReactNode;
}

/** The auto-filled tile grid every catalogue listing renders into. */
export function TileGrid({ children }: Readonly<TileGridProps>) {
  const [room, setRoom] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setRoom((current) => (current === next ? current : next));
  };
  const columns = room > 0 ? columnsFor(room, tileMin(room), GAP) : 0;
  return (
    <Box onLayout={onLayout}>
      {columns > 0 ? (
        <Grid width={room} columns={columns} gap={GAP} rowGap={ROW_GAP}>
          {Children.map(children(cellWidth(room, columns, GAP)), (tile) => (
            <div data-tile="">{tile}</div>
          ))}
        </Grid>
      ) : null}
    </Box>
  );
}

/** The element of the tile at `index`, for a caller that measures the laid-out
 *  grid: the A-Z rail's jump target and the letter it is currently over. */
export function tileAt(root: HTMLElement | null | undefined, index: number): HTMLElement | null {
  const tile = root?.querySelectorAll<HTMLElement>('[data-tile]')[index];
  return tile ?? null;
}
