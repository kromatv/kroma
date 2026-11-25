import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { NaturalWidth } from '#ui/lib/natural-width.component';
import { CellText } from './table-cell-text.component';
import { ColumnSeam } from './table-column-seam.component';
import { type TableColumn, type TableGrid, useTableGrid } from './table-columns';
import { type ColumnResize, useColumnResize } from './table-layout';
import { useTableSort } from './table-sort';
import { SortCell } from './table-sort-cell.component';

interface Seat {
  box: StyleProp<ViewStyle>;
  end: StyleProp<ViewStyle>;
  pad: StyleProp<ViewStyle>;
  bleed: StyleProp<ViewStyle>;
}

interface HeadCellProps {
  at: number;
  column: TableColumn | undefined;
  seat: Seat;
  children?: ReactNode;
}

interface HeadExtras {
  onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  seam: ReactNode;
  onWidth: ((width: number) => void) | undefined;
}

function resizeOf(resize: ColumnResize | null, at: number, children: ReactNode) {
  if (!resize) {
    return { onLayout: undefined, seam: null };
  }
  const label = typeof children === 'string' ? children : undefined;
  return {
    onLayout: (event: LayoutChangeEvent) => resize.measure(at, event.nativeEvent.layout.width),
    seam: resize.seamAfter(at) ? <ColumnSeam at={at} label={label} resize={resize} /> : null,
  };
}

function headingWidth(grid: TableGrid | null, at: number, children: ReactNode) {
  if (!grid || typeof children !== 'string') {
    return undefined;
  }
  return (width: number) => grid.fit(at, width);
}

function useHeadExtras(at: number, children: ReactNode): HeadExtras {
  const grid = useTableGrid();
  return {
    ...resizeOf(useColumnResize(), at, children),
    onWidth: headingWidth(grid, at, children),
  };
}

function HeadCell({ at, column, seat, children }: Readonly<HeadCellProps>) {
  const sorting = useTableSort();
  const extras = useHeadExtras(at, children);
  const sortsBy = column?.column;
  if (sortsBy === undefined || !sorting) {
    return (
      <PlainHead seat={seat} extras={extras}>
        {children}
      </PlainHead>
    );
  }
  return (
    <SortCell
      column={sortsBy}
      align={column?.align}
      sort={sorting}
      box={seat.box}
      pad={seat.pad}
      bleed={seat.bleed}
      seam={extras.seam}
      onLayout={extras.onLayout}
      onHeadingWidth={extras.onWidth}
    >
      {children}
    </SortCell>
  );
}

function PlainHead({
  seat,
  extras,
  children,
}: Readonly<{ seat: Seat; extras: HeadExtras; children?: ReactNode }>) {
  const label = <CellText face="head">{children}</CellText>;
  return (
    <Box role="columnheader" style={[seat.box, seat.end, seat.pad]} onLayout={extras.onLayout}>
      {label}
      {extras.onWidth ? (
        <NaturalWidth style={seat.pad} onWidth={extras.onWidth}>
          {label}
        </NaturalWidth>
      ) : null}
      {extras.seam}
    </Box>
  );
}

export { HeadCell };
