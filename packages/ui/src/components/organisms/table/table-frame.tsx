import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { useTableGrid } from './table-columns';
import type { TableVariant } from './table-context';

interface FrameProps {
  variant: TableVariant;
  label?: string;
  children: ReactNode;
}

// The scroller sits OUTSIDE `role="table"`, so a reader still walks
// table -> rowgroup -> row -> cell with nothing of ours in between.
function Frame({ variant, label, children }: Readonly<FrameProps>) {
  const grid = useTableGrid();
  const floor = grid?.minWidth ?? 0;
  const frame = variant === 'framed' ? s.framed : undefined;
  if (floor === 0) {
    return (
      <Box role="table" aria-label={label} style={frame}>
        {children}
      </Box>
    );
  }
  return (
    <Box style={frame}>
      <ScrollView horizontal style={s.scroller} contentContainerStyle={s.track}>
        <Box role="table" aria-label={label} minW={floor} style={s.wide}>
          {children}
        </Box>
      </ScrollView>
    </Box>
  );
}

const s = styles({
  framed: { border: 'border', radius: 'md', bg: 'surface1', overflow: 'hidden' },
  // A table is as tall as its rows: without this the scroller takes the height
  // of whatever it was given and scrolls the rows vertically too.
  scroller: { grow: 0, shrink: 1 },
  track: { grow: 1 },
  wide: { grow: 1 },
});

export { Frame };
