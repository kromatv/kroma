// <VirtualGrid>: the browse screens' poster grid, mounting only the rows near
// the viewport out of a library of thousands.
//
// The columns are auto-filled from the grid's own measured box, in <Grid>'s
// vocabulary (`min` / `columns` / `gap`), rather than computed by the caller
// against a fixed stage: a television is 1920 wide, a desktop window is
// whatever the user dragged it to, and a fixed column count on the second one
// runs the last tiles off the right edge.

import { NavigatorNode, NavigatorView, type NodeHandle } from '@kroma/spatial-nav/react';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, View, type ViewStyle } from 'react-native';
import { cellWidth, columnsFor } from '#ui/components/atoms/grid';
import { clipStyles, OVERSCAN } from '#ui/components/organisms/virtual/clip';
import { MovingStrip } from '#ui/components/organisms/virtual/moving-strip';
import { styles } from '#ui/core';
import { FocusReporter } from '#ui/lib/focus-report';
import { markGridFocus } from '#ui/lib/perf';
import { useStableCallback } from '#ui/lib/stable-callback';
import { GridRow } from './grid-row';
import { freeOffset, type GridRows, rowMetrics, rowTop, rowWindow, stripOffset } from './grid-rows';
import { useWheelScroll } from './use-wheel-rows';

const boxes = styles({
  noPointer: { pointerEvents: 'none' },
  viewport: { flex: true, minHeight: 0 },
  row: { position: 'absolute', left: 0 },
  header: { position: 'absolute', left: 0, top: 0 },
});
// Every row is placed at its own offset down the strip, so only the mounted
// ones have to exist and they still land where the whole list would put them.

// Rows left before the grid asks for more. Enough that the next page is in
// hand by the time a held D-pad reaches it.
const END_THRESHOLD = 3;

interface VirtualGridProps<T> {
  data: readonly T[];
  /** The narrowest a tile may be. The grid fits as many as the room allows, the
   *  way `auto-fill` does in CSS and `<Grid min>` does for a static grid. */
  min?: number;
  /** A fixed column count, for a design that demands one whatever the width.
   *  Wins over `min`. */
  columns?: number;
  /** Tile height ÷ tile width (a 2:3 poster is 1.5), which with the measured
   *  cell width is the row pitch. */
  ratio?: number;
  /** An explicit tile height in px, for tiles that are not `ratio`-shaped. Wins
   *  over `ratio`; `rowGap` is added to it the same way. */
  itemHeight?: number;
  /** Between tiles in a row, and what the column maths removes. */
  gap?: number;
  /** Between rows. Defaults to `gap`. */
  rowGap?: number;
  /** Inset of the rows. Not of the viewport, which is what clips: padding there
   *  would inset the clip and shave the rows. */
  px?: number;
  /** Room above the first row, for a focused tile's ring and scale: the strip
   *  parks the top row at the content origin and the clip is flush there. */
  pt?: number;
  /** The box width to assume until the grid has measured its own: the design
   *  width. Without one the first frame has no columns to draw. */
  width?: number;
  /** Given the tile's index and the pixel width of the cell it lands in, so a
   *  tile can size its own artwork request to the column it is drawn at. */
  renderItem: (item: T, index: number, width: number) => ReactElement;
  /** Scrolls with the first row; needs `headerHeight` set alongside it. */
  header?: ReactElement;
  headerHeight?: number;
  /** The viewport that clips. Defaults to filling its parent; give it a bounded
   *  height either way, or nothing scrolls. */
  style?: ViewStyle;
  onEndReached?: () => void;
  /** Opens the grid on this ROW (not item index) with focus, since the row is
   *  not mounted yet for `autoFocus` to reach. Read once, on mount. */
  initialIndex?: number;
}

/**
 * A vertically scrolling grid of auto-filled tiles, rendering only the rows near
 * the viewport.
 *
 * The strip is translated rather than scrolled, so nothing clips without this
 * component's `clipStyles.column` box.
 */
function VirtualGrid<T>({
  data,
  min,
  columns,
  ratio = 1,
  itemHeight,
  gap = 24,
  rowGap,
  px = 0,
  pt = 0,
  width,
  renderItem,
  header,
  headerHeight,
  style,
  onEndReached,
  initialIndex,
}: Readonly<VirtualGridProps<T>>) {
  const viewport = useRef<View>(null);
  // What to divide until the grid has measured its own box. A television never
  // resizes, so the measurement settles on the first layout and never moves
  // again; a desktop window pays one re-render per width it comes to rest at,
  // which is why the box is rounded before it is compared.
  const [screen] = useState(() => Dimensions.get('window').height);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [focusedRow, setFocusedRow] = useState(0);

  const nodes = useRef(new Map<number, NodeHandle>());
  const wanted = useRef<number | null>(null);
  const ringed = useRef<number | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout;
    const next = { width: Math.round(measured.width), height: Math.round(measured.height) };
    setBox((current) =>
      current.width === next.width && current.height === next.height ? current : next,
    );
  }, []);

  const rowGapPx = rowGap ?? gap;
  const geometry = useMemo(() => {
    const room = Math.max(0, (box.width || width || 0) - px * 2);
    const count = Math.max(1, columns ?? (min ? columnsFor(room, min, gap) : 1));
    const cell = cellWidth(room, count, gap);
    return { count, cell, pitch: (itemHeight ?? Math.round(cell * ratio)) + rowGapPx };
  }, [columns, gap, itemHeight, box.width, min, px, ratio, rowGapPx, width]);

  const hasHeader = Boolean(header) && Boolean(headerHeight);
  const metrics = useMemo(
    () =>
      rowMetrics({
        rows: Math.ceil(data.length / geometry.count),
        pitch: geometry.pitch,
        gap: rowGapPx,
        header: hasHeader,
        headerSize: headerHeight ?? 0,
        viewport: box.height || screen,
      }),
    [
      data.length,
      geometry.count,
      geometry.pitch,
      rowGapPx,
      hasHeader,
      headerHeight,
      box.height,
      screen,
    ],
  );

  const focusRow = useStableCallback((row: number) => {
    const target = Math.min(Math.max(row, 0), Math.max(metrics.count - 1, 0));
    wanted.current = target;
    setFocusedRow(target);
  });

  // A row asked for before it exists: the window has to render it first, so
  // this runs after every commit until the row REPORTS the ring. Asking once is
  // not enough - a row registers, unregisters and registers again as the window
  // settles, and the navigator hands the focus to a neighbour each time the row
  // holding it leaves the tree. The header registers under row 0 like any other,
  // so a request can always name something that will answer it.
  useEffect(() => {
    const row = wanted.current;
    if (row === null) return;
    if (ringed.current === row) {
      wanted.current = null;
      return;
    }
    nodes.current.get(row)?.focus();
  });

  // Mount-only: this is where the grid OPENS. Re-running on prop change would
  // yank focus back out from under the D-pad.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening position, not a binding.
  useEffect(() => {
    if (initialIndex !== undefined) focusRow(initialIndex);
  }, []);

  useEffect(() => {
    if (metrics.count > 1 && focusedRow >= metrics.count - 1 - END_THRESHOLD) onEndReached?.();
  }, [focusedRow, metrics.count, onEndReached]);

  const onNode = useStableCallback((row: number, node: NodeHandle | null) => {
    if (node) nodes.current.set(row, node);
    else nodes.current.delete(row);
  });

  const onHeaderNode = useStableCallback((node: NodeHandle | null) => onNode(0, node));

  const onHeaderFocus = useStableCallback(() => {
    ringed.current = 0;
    setFocusedRow(0);
  });

  const onCellFocus = useStableCallback((index: number) => {
    const row = Math.floor(index / geometry.count);
    // Which cell took focus, for the on-screen read-out: a remote bug on a
    // television has no inspector to ask.
    markGridFocus(row, index % geometry.count);
    ringed.current = row + metrics.headerRows;
    setFocusedRow(row + metrics.headerRows);
  });

  const cell = geometry.cell;
  const renderCell = useCallback(
    (item: T, index: number) => (
      <FocusReporter onFocus={() => onCellFocus(index)}>
        {renderItem(item, index, cell)}
      </FocusReporter>
    ),
    [cell, onCellFocus, renderItem],
  );

  const contentStyle = useMemo<ViewStyle>(
    () => ({ paddingHorizontal: px, paddingTop: pt, height: metrics.height }),
    [px, pt, metrics.height],
  );
  const rowStyle = useMemo<ViewStyle>(() => ({ ...boxes.row, flexDirection: 'row', gap }), [gap]);

  const rows = useMemo<GridRows>(() => ({ focus: focusRow, focusedRow }), [focusRow, focusedRow]);
  const lastRow = Math.max(0, metrics.count - metrics.headerRows - 1);
  // While a gesture runs (fraction non-null) the pointer is shut out, or the
  // navigator would focus whatever slides beneath the stationary cursor.
  const fraction = useWheelScroll(viewport, rows, lastRow, metrics.headerRows, geometry.pitch);

  const shown = rowWindow(focusedRow, metrics, OVERSCAN);
  const offset =
    fraction === null ? stripOffset(focusedRow, metrics) : freeOffset(fraction, metrics);
  const mounted: ReactElement[] = [];
  for (let row = Math.max(shown.start, metrics.headerRows); row <= shown.end; row += 1) {
    mounted.push(
      <GridRow
        key={row}
        data={data}
        first={(row - metrics.headerRows) * geometry.count}
        columns={geometry.count}
        row={row}
        top={rowTop(row, metrics)}
        style={rowStyle}
        renderCell={renderCell}
        onNode={onNode}
      />,
    );
  }

  return (
    <View style={style ?? boxes.viewport} ref={viewport} onLayout={onLayout}>
      {/* Inert on the inner clip, not the viewport: the wheel listener lives on
          the viewport's node, and pointer-events none there would drop the pan
          events too. */}
      <View style={[clipStyles.column, fraction === null ? null : boxes.noPointer]}>
        {cell > 0 ? (
          <MovingStrip axis="y" offset={offset} still={fraction !== null} style={contentStyle}>
            <NavigatorView direction="vertical" alignInGrid>
              {hasHeader && shown.start === 0 ? (
                <NavigatorNode ref={onHeaderNode} index={0} orientation="horizontal">
                  <FocusReporter onFocus={onHeaderFocus}>
                    <View style={boxes.header}>{header}</View>
                  </FocusReporter>
                </NavigatorNode>
              ) : null}
              {mounted}
            </NavigatorView>
          </MovingStrip>
        ) : null}
      </View>
    </View>
  );
}

export type { GridRows } from './grid-rows';
export type { VirtualGridProps };
export { VirtualGrid };
