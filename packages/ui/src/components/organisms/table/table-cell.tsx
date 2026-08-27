import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { drawn, FILL, useTableGrid } from './table-columns';
import { useTable } from './table-context';
import { useTableSort } from './table-sort';
import { SortCell } from './table-sort-cell';

interface TableCellProps {
  /** A string is set in the table's own type, in the head's ink or the body's;
   *  anything else is drawn as it was written. */
  children?: ReactNode;
}

function Cell({ children }: Readonly<TableCellProps>) {
  const { head, variant, at } = useTable('Cell');
  const grid = useTableGrid();
  const sorting = useTableSort();
  const column = grid?.columns[at];
  if (!drawn(column, grid?.step ?? 0)) return null;
  const pad = variant === 'framed' ? s.cell : s.cellPlain;
  const sortsBy = head && sorting ? column?.column : undefined;
  const box = grid?.boxes[at] ?? FILL;
  const body =
    typeof children === 'string' ? (
      <Text variant={head ? 'label' : 'body'} color={head ? 'text' : 'textMuted'}>
        {children}
      </Text>
    ) : (
      children
    );
  if (sortsBy !== undefined && sorting) {
    return (
      <SortCell column={sortsBy} align={column?.align} sort={sorting} box={box} pad={pad}>
        {body}
      </SortCell>
    );
  }
  return (
    <Box
      role={head ? 'columnheader' : 'cell'}
      style={[box, column?.align === 'end' ? s.end : null, pad]}
    >
      {body}
    </Box>
  );
}

const s = styles({
  cell: { px: space[3], py: space[2] },
  cellPlain: { py: space[3] },
  end: { align: 'flex-end' },
});

export type { TableCellProps };
export { Cell };
