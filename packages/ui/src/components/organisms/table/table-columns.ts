import { createContext, useContext } from 'react';
import type { ViewStyle } from 'react-native';
import { type StyleScope, sharedStyle, style } from '#ui/core';
import { BREAKPOINTS, type BreakpointName } from '#ui/core/tokens';

interface TableColumn {
  /** The name this column answers to in the Root's `sort`. Without one it is
   *  not a sort control. */
  column?: string;
  /** Fixed px, the cell's 12 of padding either side included, kept whatever
   *  the room. A heading written as a string that needs more widens it. */
  width?: number;
  /** Share of the width the fixed columns leave, defaulting to 1. */
  flex?: number;
  /** The px a `flex` column stops shrinking at, and the floor a resize stops
   *  any column at. Neither falls below what a string heading needs. */
  min?: number;
  /** Drawn from this breakpoint up, and absent below it: not narrowed, not
   *  clipped, and not read out. */
  from?: BreakpointName;
  /** Defaults to `start`. */
  align?: 'start' | 'end';
}

interface GridColumn extends TableColumn {
  heading: number;
}

interface TableGrid {
  columns: readonly GridColumn[];
  boxes: readonly ViewStyle[];
  step: number;
  minWidth: number;
  fit: (at: number, width: number) => void;
}

const GridContext = createContext<TableGrid | null>(null);

function useTableGrid(): TableGrid | null {
  return useContext(GridContext);
}

const NO_COLUMNS: readonly TableColumn[] = [];

const FILL = style({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 });

function fitHeadings(
  columns: readonly TableColumn[],
  headings: readonly number[],
): readonly GridColumn[] {
  return Array.from({ length: Math.max(columns.length, headings.length) }, (_, at) => ({
    ...columns[at],
    heading: headings[at] ?? 0,
  }));
}

function columnBox(column: GridColumn, scope: StyleScope): ViewStyle {
  if (column.width !== undefined) {
    const width = Math.max(column.width, column.heading);
    return sharedStyle(
      `table:column:${width}`,
      {
        width,
        flexGrow: 0,
        flexShrink: 0,
      },
      scope,
    );
  }
  const minWidth = Math.max(column.min ?? 0, column.heading);
  return sharedStyle(
    `table:column:${column.flex ?? 1}:${minWidth}`,
    {
      flexGrow: column.flex ?? 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth,
    },
    scope,
  );
}

function stepOf(name: BreakpointName): number {
  return BREAKPOINTS.indexOf(name);
}

function breakpointMask(columns: readonly TableColumn[]): number {
  let bits = 0;
  for (const column of columns) {
    if (column.from) {
      bits |= 1 << stepOf(column.from);
    }
  }
  return bits;
}

function drawn(column: TableColumn | undefined, step: number): boolean {
  return !column?.from || step >= stepOf(column.from);
}

function lastDrawn(columns: readonly TableColumn[], count: number, step: number): number {
  for (let at = count - 1; at >= 0; at -= 1) {
    if (drawn(columns[at], step)) {
      return at;
    }
  }
  return -1;
}

function minWidthOf(columns: readonly GridColumn[], step: number): number {
  let total = 0;
  for (const column of columns) {
    if (drawn(column, step)) {
      total += Math.max(column.width ?? column.min ?? 0, column.heading);
    }
  }
  return total;
}

export type { GridColumn, TableColumn, TableGrid };
export {
  breakpointMask,
  columnBox,
  drawn,
  FILL,
  fitHeadings,
  GridContext,
  lastDrawn,
  minWidthOf,
  NO_COLUMNS,
  useTableGrid,
};
