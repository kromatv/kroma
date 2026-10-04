import { type ReactNode, useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { ResizableStorage } from '#ui/components/organisms/resizable';
import { useBreakpointStep } from '#ui/core';
import { useStableCallback } from '#ui/lib/stable-callback';
import { Cell } from './table-cell';
import {
  breakpointMask,
  columnBox,
  GridContext,
  NO_COLUMNS,
  type TableColumn,
} from './table-columns';
import { type TableSectionProps, type TableVariant, useTable } from './table-context';
import { Frame } from './table-frame';
import { ResizeContext, useColumnLayout } from './table-layout';
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
  /** Every heading but the last carries a seam at its trailing edge that the
   *  reader drags, or takes with the remote, to share the width out again.
   *  Needs `columns`. Pressing a seam twice, or holding it, gives every
   *  column back the width it was declared with. */
  resizable?: boolean;
  /** Keeps the dragged widths between visits under this key, one layout per
   *  set of columns the window draws. */
  autoSaveId?: string;
  /** Where `autoSaveId` writes. Defaults to `localStorage`, which is null off
   *  the web. */
  storage?: ResizableStorage | null;
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
  resizable = false,
  autoSaveId,
  storage,
  children,
}: Readonly<TableRootProps>) {
  const sections = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () =>
      sections.map((_, at) => ({
        variant,
        head: false,
        ruled: at !== 0,
        at,
        of: sections.length,
      })),
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
      <GridScope
        columns={declared.list}
        boxes={declared.boxes}
        breakpoints={declared.breakpoints}
        resizable={resizable}
        autoSaveId={autoSaveId}
        storage={storage}
      >
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
  resizable,
  autoSaveId,
  storage,
  children,
}: Readonly<{
  columns: readonly TableColumn[];
  boxes: readonly ViewStyle[];
  breakpoints: number;
  resizable: boolean;
  autoSaveId: string | undefined;
  storage: ResizableStorage | null | undefined;
  children: ReactNode;
}>) {
  const step = useBreakpointStep(breakpoints);
  const layout = useColumnLayout({ columns, step, resizable, autoSaveId, storage });
  const dragged = layout.boxes ?? boxes;
  const value = useMemo(() => ({ columns, boxes: dragged, step }), [columns, dragged, step]);
  return (
    <ResizeContext.Provider value={layout.resize}>
      <GridContext.Provider value={value}>{children}</GridContext.Provider>
    </ResizeContext.Provider>
  );
}

const NO_SORT: readonly SortColumn[] = [];

function Section({ head, children }: Readonly<{ head: boolean } & TableSectionProps>) {
  const { variant, ruled } = useTable(head ? 'Header' : 'Body');
  const rows = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () => rows.map((_, at) => ({ variant, head, ruled: ruled || at !== 0, at, of: rows.length })),
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
