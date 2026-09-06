// The admin tables, on the kit's own <Table>: one column list every row aligns
// on, and a column that leaves below `md` says so there, once, rather than on
// each of its cells.

import {
  Box,
  type BoxProps,
  type ColorToken,
  Icon,
  IconButton,
  type IconName,
  Table as Kit,
  type SortColumn,
  style,
  type TableColumn,
} from '@kroma/ui/kit';
import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable } from 'react-native';

/** Numerals that line up from row to row, for a date or a count column. */
export const TABULAR = style({ fontVariant: ['tabular-nums'] });

interface TableRootProps {
  /** One entry per column, in the order the cells are written. A column with
   *  `from: 'md'` is drawn from that breakpoint up and absent below it, in the
   *  header and in every row. */
  columns: readonly TableColumn[];
  /** Names the table to assistive tech. Draws nothing. */
  label?: string;
  /** The columns the rows are ordered by, and the press that changes it: given
   *  both, every heading whose column has a name becomes the sort control. */
  sort?: readonly SortColumn[];
  onSortChange?: (next: readonly SortColumn[], details: { column: string }) => void;
  /** A <Table.Header>, then the rows. */
  children: ReactNode;
}

function Root({ columns, label, sort, onSortChange, children }: Readonly<TableRootProps>) {
  const kids = Children.toArray(children).filter(isValidElement);
  const heads = kids.filter((kid) => kid.type === Header);
  const rows = kids.filter((kid) => kid.type !== Header);
  return (
    <Kit.Root label={label} columns={columns} sort={sort} onSortChange={onSortChange}>
      {heads}
      <Kit.Body>{rows}</Kit.Body>
    </Kit.Root>
  );
}

/** The heading band above the rows: one <Table.Column> per column. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Kit.Header>
      <Kit.Row>{children}</Kit.Row>
    </Kit.Header>
  );
}

interface TableRowProps {
  /** Makes the whole row the control, so it is one pointer target and one tab
   *  stop rather than a row of them. The controls a cell carries stay their own
   *  buttons beside it. */
  onPress?: () => void;
  children: ReactNode;
}

/** One record. */
function Row({ onPress, children }: Readonly<TableRowProps>) {
  if (!onPress) return <Kit.Row>{children}</Kit.Row>;
  return (
    <Kit.Row asChild>
      <Pressable onPress={onPress}>{children}</Pressable>
    </Kit.Row>
  );
}

interface TableCellProps extends Omit<BoxProps, 'children'> {
  children?: ReactNode;
}

/** One column of one row. The box props lay its content out; the column's own
 *  width and place come from the Root's `columns`. */
function Cell({ children, ...box }: Readonly<TableCellProps>) {
  const laid = Object.keys(box).length > 0;
  return <Kit.Cell>{laid ? <Box {...box}>{children}</Box> : children}</Kit.Cell>;
}

interface TableColumnProps {
  children?: ReactNode;
}

/** A column's name, in the header band. */
function Column({ children }: Readonly<TableColumnProps>) {
  return <Kit.Cell>{children}</Kit.Cell>;
}

interface TableActionProps {
  /** The hue the whole control is built from: its glyph, its edge and its two
   *  fills. */
  tone: ColorToken;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** A shortcut sitting in a row, next to whatever the row's own press does.
 *
 *  The kit's ghost icon button, with only the GLYPH tinted: the surface, the
 *  hover wash, the press and the focus ring all come from the one control every
 *  other button in the console is built from.
 *
 *  `label` names it to assistive tech and is not drawn: a row of squares that
 *  each raise a tip as the cursor crosses them is a row that flickers. */
function Action({ tone, icon, label, onPress, disabled = false }: Readonly<TableActionProps>) {
  return (
    <IconButton
      control="sm"
      radius="sm"
      variant="ghost"
      label={label}
      onPress={onPress}
      disabled={disabled}
    >
      <Icon name={icon} size={18} color={tone} thickness={2.2} />
    </IconButton>
  );
}

/**
 * An aligned admin table.
 *
 * ```tsx
 * <Table.Root columns={[{}, { width: 190, from: 'md' }, { width: 76 }]}>
 *   <Table.Header>
 *     <Table.Column>Titre</Table.Column>
 *     <Table.Column>Demandeur</Table.Column>
 *     <Table.Cell />
 *   </Table.Header>
 *   <Table.Row onPress={open}>…</Table.Row>
 * </Table.Root>
 * ```
 */
const Table = { Root, Header, Row, Cell, Column, Action };

export type { SortColumn, TableColumn } from '@kroma/ui/kit';
export type { TableActionProps, TableCellProps, TableColumnProps, TableRootProps, TableRowProps };
export { Table };
