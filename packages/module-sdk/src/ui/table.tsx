// The admin tables: columns that must line up across every row.
//
// That is a real CSS grid, which React Native has none of, so the kit carries no
// <Table> (components/DESIGN.md §8) and it lives here instead -- in the SDK
// rather than in one console, because a module's admin page needs the same
// aligned rows the console's own pages do. The grid is in `@kroma/ui`'s
// `styles/base.css` under `.admin-table-*`; a table states only its column
// template, which reaches the rows as a custom property.

import {
  Box,
  type BoxProps,
  type ColorToken,
  Icon,
  IconButton,
  type IconName,
  Surface,
  Text,
} from '@kroma/ui/kit';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from 'react';
import type { TextStyle } from 'react-native';

// The class names the stylesheet above answers to. Stated here rather than
// imported from a shell: this component IS their only caller.
const ADMIN_PRESS = 'admin-press';
const ADMIN_TABLE_HEAD = 'admin-table-head';
const ADMIN_TABLE_ROW = 'admin-table-row';

/** Numerals that line up from row to row, for a date or a count column. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const TableContext = createContext<CSSProperties | null>(null);

const WIDE = { wide: 'true' } as const;

function useTemplate(part: string): CSSProperties {
  const template = useContext(TableContext);
  if (!template) throw new Error(`<Table.${part}> must be used inside <Table.Root>`);
  return template;
}

interface TableRootProps {
  /** The template every row aligns on from `md` up, as a `grid-template-columns`
   *  value. */
  columns: string;
  /** The template below `md`, where the columns marked `wide` have dropped out.
   *  Defaults to the title column plus one trailing column. */
  narrow?: string;
  children: ReactNode;
}

function Root({ columns, narrow, children }: Readonly<TableRootProps>) {
  const template = useMemo(
    () => ({ '--admin-table-columns': columns, '--admin-table-narrow': narrow }) as CSSProperties,
    [columns, narrow],
  );
  return (
    <TableContext.Provider value={template}>
      <Surface elevated pad="none" overflow="hidden" radius="xl">
        {children}
      </Surface>
    </TableContext.Provider>
  );
}

/** The heading band above the rows. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={ADMIN_TABLE_HEAD} style={useTemplate('Header')}>
      {children}
    </div>
  );
}

interface TableRowProps {
  /** Makes the whole row the control, so it is one pointer target and one tab
   *  stop rather than a row of them. The row still reads as its own cells: the
   *  press layer takes its name from them. */
  onPress?: () => void;
  children: ReactNode;
}

/** One record. */
function Row({ onPress, children }: Readonly<TableRowProps>) {
  const style = useTemplate('Row');
  const id = useId();
  if (!onPress) {
    return (
      <div className={ADMIN_TABLE_ROW} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div className={ADMIN_TABLE_ROW} data-pressable="true" id={id} style={style}>
      <button type="button" className={ADMIN_PRESS} aria-labelledby={id} onClick={onPress} />
      {children}
    </div>
  );
}

interface TableCellProps extends Omit<BoxProps, 'children'> {
  /** Drops out of the table below `md`, where there is no room for it. */
  wide?: boolean;
  children?: ReactNode;
}

/** One column of one row. */
function Cell({ wide, children, ...box }: Readonly<TableCellProps>) {
  return (
    <Box minW={0} dataSet={wide ? WIDE : undefined} {...box}>
      {children}
    </Box>
  );
}

/** A column's name, in the header band. */
function Column({ wide, children }: Readonly<{ wide?: boolean; children?: ReactNode }>) {
  return (
    <Cell wide={wide}>
      <Text variant="overline" color="textDim">
        {children}
      </Text>
    </Cell>
  );
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
 *  other button in the console is built from. An earlier version painted its own
 *  tinted square, which fought the variant's hover and left the control blank
 *  under the cursor -- the hue belongs to the icon, the states to the kit.
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
      <Icon name={icon} size={16} color={tone} thickness={2.4} />
    </IconButton>
  );
}

/**
 * An aligned admin table.
 *
 * ```tsx
 * <Table.Root columns="minmax(0,1fr) 190px 76px">
 *   <Table.Header>
 *     <Table.Column>Titre</Table.Column>
 *     <Table.Column wide>Demandeur</Table.Column>
 *     <Table.Column />
 *   </Table.Header>
 *   <Table.Row onPress={open}>…</Table.Row>
 * </Table.Root>
 * ```
 */
const Table = { Root, Header, Row, Cell, Column, Action };

export type { TableActionProps, TableCellProps, TableRootProps, TableRowProps };
export { Table };
