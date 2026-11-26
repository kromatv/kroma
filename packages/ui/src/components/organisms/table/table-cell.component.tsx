import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { resolveStyles, type StyleScope, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { space } from '#ui/core/tokens';
import { CellText } from './table-cell-text.component';
import { drawn, FILL, lastDrawn, NO_COLUMNS, useTableGrid } from './table-columns';
import { type TableVariant, useTable } from './table-context';
import { HeadCell } from './table-head-cell.component';

interface TableCellProps {
  /** A string is set in the table's own type, in the head's ink or the body's,
   *  and a string heading widens its column to fit; anything else is drawn as
   *  it was written. */
  children?: ReactNode;
}

function Cell({ children }: Readonly<TableCellProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const { head, variant, at, of } = useTable('Cell');
  const grid = useTableGrid();
  const column = grid?.columns[at];
  const step = grid?.step ?? 0;
  if (!drawn(column, step)) {
    return null;
  }
  const pads = padsFor(variant, at !== lastDrawn(grid?.columns ?? NO_COLUMNS, of, step), scope);
  const box = grid?.boxes[at] ?? FILL;
  const end = column?.align === 'end' ? s.end : null;
  if (head) {
    return (
      <HeadCell at={at} column={column} seat={{ box, end, ...pads }}>
        {children}
      </HeadCell>
    );
  }
  return (
    <Box role="cell" style={[box, end, pads.pad]}>
      <CellText face="body">{children}</CellText>
    </Box>
  );
}

const sDefinition = styles({
  cell: { px: space[3], py: space[2], justify: 'center', overflow: 'hidden' },
  bleed: { mx: -space[3], my: -space[2] },
  cellPlain: { py: space[3], justify: 'center', overflow: 'hidden' },
  bleedPlain: { my: -space[3] },
  cellGutter: { py: space[3], pe: space[3], justify: 'center', overflow: 'hidden' },
  bleedGutter: { my: -space[3], me: -space[3] },
  end: { align: 'flex-end' },
});

function padsFor(variant: TableVariant, gutter: boolean, scope: StyleScope) {
  if (variant === 'framed') {
    return {
      pad: resolveStyles(sDefinition, scope).cell,
      bleed: resolveStyles(sDefinition, scope).bleed,
    };
  }
  return gutter
    ? {
        pad: resolveStyles(sDefinition, scope).cellGutter,
        bleed: resolveStyles(sDefinition, scope).bleedGutter,
      }
    : {
        pad: resolveStyles(sDefinition, scope).cellPlain,
        bleed: resolveStyles(sDefinition, scope).bleedPlain,
      };
}

export type { TableCellProps };
export { Cell };
