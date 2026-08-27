// The admin tables: columns that must line up across every row. That is a real
// CSS grid, which the kit's own <Table> cannot use because it is authored
// against React Native. The grid itself is `styles/admin-table.ts` in
// `@kroma/ui`, under the `.admin-table-*` class names below.

import {
  Box,
  type BoxProps,
  type ColorToken,
  color,
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
  useState,
} from 'react';
import type { TextStyle } from 'react-native';
import type { SortDirection } from '../use-sorted-table';

const ADMIN_PRESS = 'admin-press';
const ADMIN_TABLE_HEAD = 'admin-table-head';
const ADMIN_TABLE_ROW = 'admin-table-row';

/** Numerals that line up from row to row, for a date or a count column. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const TableContext = createContext<CSSProperties | null>(null);

const WIDE = { wide: 'true' } as const;

const SORT_GLYPH = {
  asc: 'arrow-narrow-up',
  desc: 'arrow-narrow-down',
  none: 'arrows-sort',
} as const satisfies Record<string, IconName>;

const ARIA_SORT = { asc: 'ascending', desc: 'descending', none: 'none' } as const;

const SORT_GLYPH_SIZE = 13;

const HEAD_CELL: CSSProperties = { minWidth: 0 };

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
  /** Names the table to assistive tech. Draws nothing. */
  label?: string;
  children: ReactNode;
}

function Root({ columns, narrow, label, children }: Readonly<TableRootProps>) {
  const template = useMemo(
    () => ({ '--admin-table-columns': columns, '--admin-table-narrow': narrow }) as CSSProperties,
    [columns, narrow],
  );
  return (
    <TableContext.Provider value={template}>
      <Surface elevated pad="none" overflow="hidden" radius="xl" role="table" aria-label={label}>
        {children}
      </Surface>
    </TableContext.Provider>
  );
}

/** The heading band above the rows. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  const template = useTemplate('Header');
  return (
    // biome-ignore lint/a11y/useSemanticElements: a real <table> cannot share one grid-template-columns across its rows, so the roles are what makes this a table to a screen reader.
    // biome-ignore lint/a11y/useFocusableInteractive: a row is not a control; the cells inside it are.
    <div
      className={ADMIN_TABLE_HEAD}
      role="row"
      style={{ ...template, background: color('surface2') }}
    >
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
      // biome-ignore lint/a11y/useSemanticElements: a real <table> cannot share one grid-template-columns across its rows, so the roles are what makes this a table to a screen reader.
      // biome-ignore lint/a11y/useFocusableInteractive: a row is not a control; the cells inside it are.
      <div className={ADMIN_TABLE_ROW} role="row" style={style}>
        {children}
      </div>
    );
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: a real <table> cannot share one grid-template-columns across its rows, so the roles are what makes this a table to a screen reader.
    // biome-ignore lint/a11y/useFocusableInteractive: the press layer below is the control, and it is a real <button>.
    <div className={ADMIN_TABLE_ROW} role="row" data-pressable="true" id={id} style={style}>
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
function Cell({ wide, dataSet, children, ...box }: Readonly<TableCellProps>) {
  return (
    <Box minW={0} role="cell" dataSet={wide ? { ...dataSet, ...WIDE } : dataSet} {...box}>
      {children}
    </Box>
  );
}

interface TableColumnProps {
  wide?: boolean;
  /** Which way this column is ordering the table right now, `false` when it can
   *  sort but another column is doing it. Ignored without `onSortPress`. */
  sorted?: SortDirection | false;
  /** Given, the whole heading cell becomes the sort control. */
  onSortPress?: () => void;
  children?: ReactNode;
}

/** A column's name, in the header band. */
function Column({ wide, sorted = false, onSortPress, children }: Readonly<TableColumnProps>) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const state = sorted || 'none';
  const drawGlyph = onSortPress !== undefined && (sorted !== false || revealed);
  const watch = onSortPress && {
    onMouseEnter: () => setRevealed(true),
    onMouseLeave: () => setRevealed(false),
    onFocus: () => setRevealed(true),
    onBlur: () => setRevealed(false),
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a real <table> cannot share one grid-template-columns across its rows, so the roles are what makes this a table to a screen reader.
    // biome-ignore lint/a11y/useFocusableInteractive: a heading is not the control; the press layer below is, and it is a real <button>.
    <div
      role="columnheader"
      aria-sort={onSortPress ? ARIA_SORT[state] : undefined}
      data-pressable={onSortPress ? 'true' : undefined}
      data-wide={wide ? 'true' : undefined}
      id={id}
      style={HEAD_CELL}
      {...watch}
    >
      {onSortPress ? (
        <button type="button" className={ADMIN_PRESS} aria-labelledby={id} onClick={onSortPress} />
      ) : null}
      <Box row gap={6} minW={0}>
        <Text variant="overline" color={sorted ? 'accent' : 'textDim'} lines={1}>
          {children}
        </Text>
        {onSortPress ? (
          <Box w={SORT_GLYPH_SIZE} h={SORT_GLYPH_SIZE} shrink={0} center>
            {drawGlyph ? (
              <Icon
                name={SORT_GLYPH[state]}
                size={SORT_GLYPH_SIZE}
                thickness={2.2}
                color={sorted ? 'accent' : 'glyphDim'}
              />
            ) : null}
          </Box>
        ) : null}
      </Box>
    </div>
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

export type { TableActionProps, TableCellProps, TableColumnProps, TableRootProps, TableRowProps };
export { Table };
