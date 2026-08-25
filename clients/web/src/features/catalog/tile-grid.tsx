// The catalogue's poster grid. The kit's <Grid> lays the cells out; this
// measures the row so every tile can be handed the width of the cell it lands
// in, which is what a web <Poster> needs to size its own art request.

import { Box, Grid } from '@kroma/ui/kit';
import { Children, type ReactNode, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { TILE_GAP, TILE_ROW_GAP, tileCell, tileColumns } from '#web/features/catalog/tile-layout';

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
  const columns = tileColumns(room);
  return (
    <Box onLayout={onLayout}>
      {columns > 0 ? (
        <Grid width={room} columns={columns} gap={TILE_GAP} rowGap={TILE_ROW_GAP}>
          {Children.map(children(tileCell(room, columns)), (tile) => (
            <div data-tile="">{tile}</div>
          ))}
        </Grid>
      ) : null}
    </Box>
  );
}
