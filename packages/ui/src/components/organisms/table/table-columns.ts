import { createContext, useContext } from 'react';
import type { ViewStyle } from 'react-native';
import { BREAKPOINTS, type BreakpointName } from '#ui/core/tokens';

interface TableColumn {
  /** The name this column answers to in the Root's `sort`. Without one it is
   *  not a sort control. */
  column?: string;
  /** Fixed px. A column stating one neither grows nor shrinks. */
  width?: number;
  /** Share of the width the fixed columns leave, defaulting to 1. */
  flex?: number;
  /** The px a `flex` column stops shrinking at. */
  min?: number;
  /** Drawn from this breakpoint up, and absent below it: not narrowed, not
   *  clipped, and not read out. */
  from?: BreakpointName;
  /** Defaults to `start`. */
  align?: 'start' | 'end';
}

interface TableGrid {
  columns: readonly TableColumn[];
  boxes: readonly ViewStyle[];
  step: number;
  minWidth: number;
}

const GridContext = createContext<TableGrid | null>(null);

function useTableGrid(): TableGrid | null {
  return useContext(GridContext);
}

const NO_COLUMNS: readonly TableColumn[] = [];

const FILL: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 };

function columnBox(column: TableColumn): ViewStyle {
  if (column.width !== undefined) {
    return { width: column.width, flexGrow: 0, flexShrink: 0 };
  }
  return {
    flexGrow: column.flex ?? 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: column.min ?? 0,
  };
}

function stepOf(name: BreakpointName): number {
  return BREAKPOINTS.indexOf(name);
}

function breakpointMask(columns: readonly TableColumn[]): number {
  let bits = 0;
  for (const column of columns) {
    if (column.from) bits |= 1 << stepOf(column.from);
  }
  return bits;
}

function drawn(column: TableColumn | undefined, step: number): boolean {
  return !column?.from || step >= stepOf(column.from);
}

function minWidthOf(columns: readonly TableColumn[], step: number): number {
  let total = 0;
  for (const column of columns) {
    if (drawn(column, step)) total += column.width ?? column.min ?? 0;
  }
  return total;
}

export type { TableColumn, TableGrid };
export {
  breakpointMask,
  columnBox,
  drawn,
  FILL,
  GridContext,
  minWidthOf,
  NO_COLUMNS,
  useTableGrid,
};
