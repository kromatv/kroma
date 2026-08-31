import { type ReactNode, useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { useBreakpointStep } from '#ui/core';
import { useStableCallback } from '#ui/lib/stable-callback';
import { Cell } from './table-cell';
import {
  breakpointMask,
  columnBox,
  GridContext,
  minWidthOf,
  NO_COLUMNS,
  type TableColumn,
} from './table-columns';
import { type TableSectionProps, type TableVariant, useTable } from './table-context';
import { Frame } from './table-frame';
import { Placed, parts } from './table-place';
import { Row } from './table-row';
import { nextSort, type SortColumn, SortContext, type TableSort } from './table-sort';

interface TableRootProps {
  /** Defaults to `framed`. */
  variant?: TableVariant;
  /** Names the table to assistive tech. Draws nothing. */
  label?: string;
  /** One entry per column, in the order the cells are written. Left out, every
   *  cell takes an equal share. */
  columns?: readonly TableColumn[];
  /** The columns the rows are ordered by, first key first. The table never
   *  reorders its own rows: they are the caller's. */
  sort?: readonly SortColumn[];
  /** Given, every heading whose column names one becomes the sort control. */
  onSortChange?: (next: readonly SortColumn[], details: { column: string }) => void;
  /** A press adds its column to the sort as the last tiebreak instead of
   *  replacing it. */
  multiple?: boolean;
  /** The sort can never be handed back empty: a press on the last column
   *  sorting turns it around rather than dropping it. */
  required?: boolean;
  /** A DIRECT <Table.Header>, <Table.Body> or <Table.Row> child. */
  children?: ReactNode;
}

function Root({
  variant = 'framed',
  label,
  columns,
  sort,
  onSortChange,
  multiple = false,
  required = false,
  children,
}: Readonly<TableRootProps>) {
  const sections = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () => sections.map((_, at) => ({ variant, head: false, ruled: at !== 0, at })),
    [variant, sections],
  );
  const declared = useMemo(() => {
    const list = columns ?? NO_COLUMNS;
    return { list, boxes: list.map(columnBox), breakpoints: breakpointMask(list) };
  }, [columns]);
  const press = useStableCallback((column: string) => {
    onSortChange?.(nextSort(sort ?? NO_SORT, column, { multiple, required }), { column });
  });
  const sorting = useMemo<TableSort | null>(() => {
    if (!sort && !onSortChange) return null;
    return { columns: sort ?? NO_SORT, press: onSortChange ? press : null };
  }, [sort, onSortChange, press]);
  return (
    <SortContext.Provider value={sorting}>
      <GridScope columns={declared.list} boxes={declared.boxes} breakpoints={declared.breakpoints}>
        <Frame variant={variant} label={label}>
          <Placed places={places} items={sections} />
        </Frame>
      </GridScope>
    </SortContext.Provider>
  );
}

function GridScope({
  columns,
  boxes,
  breakpoints,
  children,
}: Readonly<{
  columns: readonly TableColumn[];
  boxes: readonly ViewStyle[];
  breakpoints: number;
  children: ReactNode;
}>) {
  const step = useBreakpointStep(breakpoints);
  const value = useMemo(
    () => ({ columns, boxes, step, minWidth: minWidthOf(columns, step) }),
    [columns, boxes, step],
  );
  return <GridContext.Provider value={value}>{children}</GridContext.Provider>;
}

const NO_SORT: readonly SortColumn[] = [];

function Section({ head, children }: Readonly<{ head: boolean } & TableSectionProps>) {
  const { variant, ruled } = useTable(head ? 'Header' : 'Body');
  const rows = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () => rows.map((_, at) => ({ variant, head, ruled: ruled || at !== 0, at })),
    [variant, head, ruled, rows],
  );
  return (
    <Box role="rowgroup" bg={head && variant === 'framed' ? 'surface2' : undefined}>
      <Placed places={places} items={rows} />
    </Box>
  );
}

function Header({ children }: Readonly<TableSectionProps>) {
  return <Section head>{children}</Section>;
}

function Body({ children }: Readonly<TableSectionProps>) {
  return <Section head={false}>{children}</Section>;
}

/**
 * Rows of the same shape.
 *
 * ```tsx
 * <Table.Root label="Modules" columns={[{ column: 'id' }, { width: 90 }]}>
 *   <Table.Header>
 *     <Table.Row>
 *       <Table.Cell>Module</Table.Cell>
 *       <Table.Cell>Port</Table.Cell>
 *     </Table.Row>
 *   </Table.Header>
 *   <Table.Body>
 *     <Table.Row>
 *       <Table.Cell>tv.kroma.torrents</Table.Cell>
 *       <Table.Cell>41310</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table.Root>
 * ```
 */
const Table = { Root, Header, Body, Row, Cell };

export type { TableCellProps } from './table-cell';
export type { TableRowProps } from './table-row';
export type { SortDirection } from './table-sort';
export type { SortColumn, TableColumn, TableRootProps, TableSectionProps, TableVariant };
export { Table };
