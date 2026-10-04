import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { ColumnSeam } from './table-column-seam';
import { drawn, FILL, lastDrawn, NO_COLUMNS, useTableGrid } from './table-columns';
import { type TableVariant, useTable } from './table-context';
import { useColumnResize } from './table-layout';
import { sortPlace, useTableSort } from './table-sort';
import { SortCell } from './table-sort-cell';

interface TableCellProps {
  /** A string is set in the table's own type, in the head's ink or the body's;
   *  anything else is drawn as it was written. */
  children?: ReactNode;
}

function Cell({ children }: Readonly<TableCellProps>) {
  const { head, variant, at, of } = useTable('Cell');
  const grid = useTableGrid();
  const sorting = useTableSort();
  const resize = useColumnResize();
  const column = grid?.columns[at];
  if (!drawn(column, grid?.step ?? 0)) return null;
  const sizing = head ? resize : null;
  const onLayout = sizing
    ? (event: LayoutChangeEvent) => sizing.measure(at, event.nativeEvent.layout.width)
    : undefined;
  const seam = sizing?.seamAfter(at) ? (
    <ColumnSeam
      at={at}
      label={typeof children === 'string' ? children : undefined}
      resize={sizing}
    />
  ) : null;
  const gutter = at !== lastDrawn(grid?.columns ?? NO_COLUMNS, of, grid?.step ?? 0);
  const { pad, bleed } = padsFor(variant, gutter);
  const sortsBy = head && sorting ? column?.column : undefined;
  const sorted =
    sortsBy !== undefined && sorting !== null && sortPlace(sorting.columns, sortsBy) !== null;
  const box = grid?.boxes[at] ?? FILL;
  const headInk = sorted ? 'accent' : 'textDim';
  const body =
    typeof children === 'string' ? (
      <Text variant={head ? 'overline' : 'body'} color={head ? headInk : 'textMuted'} lines={1}>
        {children}
      </Text>
    ) : (
      children
    );
  if (sortsBy !== undefined && sorting) {
    return (
      <SortCell
        column={sortsBy}
        align={column?.align}
        sort={sorting}
        box={box}
        pad={pad}
        bleed={bleed}
        seam={seam}
        onLayout={onLayout}
      >
        {body}
      </SortCell>
    );
  }
  return (
    <Box
      role={head ? 'columnheader' : 'cell'}
      style={[box, column?.align === 'end' ? s.end : null, pad]}
      onLayout={onLayout}
    >
      {body}
      {seam}
    </Box>
  );
}

const s = styles({
  cell: { px: space[3], py: space[2], justify: 'center', overflow: 'hidden' },
  bleed: { mx: -space[3], my: -space[2] },
  cellPlain: { py: space[3], justify: 'center', overflow: 'hidden' },
  bleedPlain: { my: -space[3] },
  cellGutter: { py: space[3], pr: space[3], justify: 'center', overflow: 'hidden' },
  bleedGutter: { my: -space[3], mr: -space[3] },
  end: { align: 'flex-end' },
});

function padsFor(variant: TableVariant, gutter: boolean) {
  if (variant === 'framed') return { pad: s.cell, bleed: s.bleed };
  return gutter
    ? { pad: s.cellGutter, bleed: s.bleedGutter }
    : { pad: s.cellPlain, bleed: s.bleedPlain };
}

export type { TableCellProps };
export { Cell };
