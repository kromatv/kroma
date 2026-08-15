// <VirtualGrid>: the browse screens' poster grid, virtualising a library of
// thousands of tiles via react-tv-space-navigation's virtual focus nodes.
//
// The columns are auto-filled from the grid's own measured box, in <Grid>'s
// vocabulary (`min` / `columns` / `gap`), rather than computed by the caller
// against a fixed stage: a television is 1920 wide, a desktop window is
// whatever the user dragged it to, and a fixed column count on the second one
// runs the last tiles off the right edge.

import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, View, type ViewStyle } from 'react-native';
import {
  SpatialNavigationVirtualizedGrid,
  type SpatialNavigationVirtualizedListRef,
} from 'react-tv-space-navigation';
import { cellWidth, columnsFor } from '#ui/components/atoms/grid';
import { clipStyles, OVERSCAN } from '#ui/components/organisms/virtual/clip';
import { FocusReporter } from '#ui/lib/focus-report';
import { markGridFocus } from '#ui/lib/perf';

const NO_POINTER = { pointerEvents: 'none' } as const;
const VIEWPORT: ViewStyle = { flex: 1, minHeight: 0 };

import { useWheelScroll } from './use-wheel-rows';

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
  /** An explicit row pitch in px (tile height + `rowGap`), for tiles that are
   *  not `ratio`-shaped. Wins over `ratio`. */
  itemHeight?: number;
  /** Between tiles in a row, and what the column maths removes. */
  gap?: number;
  /** Between rows. Defaults to `gap`. */
  rowGap?: number;
  /** Inset of the rows. Not of the viewport, which is what clips: padding there
   *  would inset the clip and shave the rows. */
  px?: number;
  /** Room above the first row, for a focused tile's ring and scale: the list
   *  parks the focused row at the content origin and the clip is flush there. */
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
  /** Opens the list on this ROW (not item index) with focus, via the list's ref
   *  since the row isn't mounted yet for `autoFocus` to reach. */
  initialIndex?: number;
}

/**
 * A vertically scrolling grid of auto-filled tiles, rendering only the rows near
 * the viewport.
 *
 * The library translates its content rather than scrolling a real viewport, so
 * nothing clips without this wrapper's `clipStyles.column` box.
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
  const list = useRef<SpatialNavigationVirtualizedListRef>(null);
  const viewport = useRef<View>(null);
  const [measured, setMeasured] = useState(0);

  // Mount-only: this is where the list OPENS. Re-running on prop change would
  // yank focus back out from under the D-pad.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening position, not a binding.
  useEffect(() => {
    if (initialIndex) list.current?.focus(initialIndex);
  }, []);

  // A television never resizes, so this settles on the first layout and the
  // state never changes again; a desktop window pays one re-render per width it
  // comes to rest at, which is why the width is rounded before it is compared.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  }, []);

  const rowGapPx = rowGap ?? gap;
  const geometry = useMemo(() => {
    const room = Math.max(0, (measured || width || 0) - px * 2);
    const count = columns ?? (min ? columnsFor(room, min, gap) : 1);
    const cell = cellWidth(room, count, gap);
    return { count, cell, pitch: itemHeight ?? Math.round(cell * ratio) + rowGapPx };
  }, [columns, gap, itemHeight, measured, min, px, ratio, rowGapPx, width]);

  const contentStyle = useMemo<ViewStyle>(
    () => ({ paddingHorizontal: px, paddingTop: pt }),
    [px, pt],
  );
  const rowStyle = useMemo<ViewStyle>(() => ({ gap }), [gap]);

  const cell = geometry.cell;
  const renderCell = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      // Reports which cell took focus, for the on-screen read-out: a remote bug
      // on a television has no inspector to ask.
      <FocusReporter
        onFocus={() => markGridFocus(Math.floor(index / geometry.count), index % geometry.count)}
      >
        {renderItem(item, index, cell)}
      </FocusReporter>
    ),
    [cell, geometry.count, renderItem],
  );

  const lastRow = Math.max(0, Math.ceil(data.length / geometry.count) - 1);
  // While a gesture runs (fraction non-null) the pointer is shut out, or the
  // navigator would focus whatever slides beneath the stationary cursor.
  const fraction = useWheelScroll(viewport, list, lastRow, header ? 1 : 0, geometry.pitch);

  return (
    <View style={style ?? VIEWPORT} ref={viewport} onLayout={onLayout}>
      {/* Inert on the inner clip, not the viewport: the wheel listener lives on
          the viewport's node, and pointer-events none there would drop the pan
          events too. */}
      <View style={[clipStyles.column, fraction === null ? null : NO_POINTER]}>
        {cell > 0 ? (
          /* The library's ref type omits `| null`, which every real ref has before it attaches. */
          <SpatialNavigationVirtualizedGrid
            ref={list as RefObject<SpatialNavigationVirtualizedListRef>}
            data={data as T[]}
            numberOfColumns={geometry.count}
            itemHeight={geometry.pitch}
            additionalRenderedRows={OVERSCAN}
            // A GRID is not a rail. The library's default, `stick-to-start`,
            // parks the focused row at the top of the viewport, so every press of
            // Down scrolls the grid by exactly one row and the ring never moves:
            // the posters slide underneath it and the set reads as if the arrow
            // did nothing. Rails want that behaviour - a rail's focused tile
            // belongs at the left edge - but a grid has rows above and below worth
            // seeing, so it scrolls only when the selection reaches an edge.
            scrollBehavior="jump-on-scroll"
            header={header}
            headerSize={headerHeight}
            rowContainerStyle={rowStyle}
            style={contentStyle}
            freeScrollFraction={fraction}
            onEndReached={onEndReached}
            renderItem={renderCell}
          />
        ) : null}
      </View>
    </View>
  );
}

export type { VirtualGridProps };
export { VirtualGrid };
