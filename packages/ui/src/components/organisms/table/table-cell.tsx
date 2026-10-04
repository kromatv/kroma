import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { ColumnSeam } from './table-column-seam';
import { drawn, FILL, lastDrawn, NO_COLUMNS, useTableGrid } from './table-columns';
import { type TableVariant, useTable } from './table-context';
import { type ColumnResize, useColumnResize } from './table-layout';
import { sortPlace, useTableSort } from './table-sort';
import { SortCell } from './table-sort-cell';

interface TableCellProps {
  /** A string is set in the table's own type, in the head's ink or the body's;
   *  anything else is drawn as it was written. */
  children?: ReactNode;
}

interface HeadResize {
  onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  seam: ReactNode;
}

const NO_RESIZE: HeadResize = { onLayout: undefined, seam: null };

function resizeOf(resize: ColumnResize | null, at: number, children: ReactNode): HeadResize {
  if (!resize) return NO_RESIZE;
  const label = typeof children === 'string' ? children : undefined;
  return {
    onLayout: (event) => resize.measure(at, event.nativeEvent.layout.width),
    seam: resize.seamAfter(at) ? <ColumnSeam at={at} label={label} resize={resize} /> : null,
  };
}

function inkOf(head: boolean, sorted: boolean) {
  if (!head) return 'textMuted';
  return sorted ? 'accent' : 'textDim';
}

function CellText({
  head,
  sorted,
  children,
}: Readonly<{ head: boolean; sorted: boolean; children: ReactNode }>) {
  if (typeof children !== 'string') return children;
  return (
    <Text variant={head ? 'overline' : 'body'} color={inkOf(head, sorted)} lines={1}>
      {children}
    </Text>
  );
}

function Cell({ children }: Readonly<TableCellProps>) {
  const { head, variant, at, of } = useTable('Cell');
  const grid = useTableGrid();
  const sorting = useTableSort();
  const resize = useColumnResize();
  const column = grid?.columns[at];
  const step = grid?.step ?? 0;
  if (!drawn(column, step)) return null;
  const { onLayout, seam } = resizeOf(head ? resize : null, at, children);
  const { pad, bleed } = padsFor(variant, at !== lastDrawn(grid?.columns ?? NO_COLUMNS, of, step));
  const box = grid?.boxes[at] ?? FILL;
  const sortsBy = head ? column?.column : undefined;
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
        <CellText head sorted={sortPlace(sorting.columns, sortsBy) !== null}>
          {children}
        </CellText>
      </SortCell>
    );
  }
  return (
    <Box
      role={head ? 'columnheader' : 'cell'}
      style={[box, column?.align === 'end' ? s.end : null, pad]}
      onLayout={onLayout}
    >
      <CellText head={head} sorted={false}>
        {children}
      </CellText>
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
