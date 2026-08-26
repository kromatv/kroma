import { Box, Grid } from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { TILE_GAP, TILE_ROW_GAP, tileCell, tileColumns } from '#web/shared/lib/tile-layout';

export interface TileGridProps {
  /** The tiles, given the pixel width of the cell each one lands in. */
  children: (width: number) => ReactNode;
}

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
          {children(tileCell(room, columns))}
        </Grid>
      ) : null}
    </Box>
  );
}
