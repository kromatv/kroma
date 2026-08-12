// <VirtualGrid>: the browse screens' poster grid, virtualising a library of
// thousands of tiles via react-tv-space-navigation's virtual focus nodes.

import { type ReactElement, type RefObject, useEffect, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  SpatialNavigationVirtualizedGrid,
  type SpatialNavigationVirtualizedListRef,
} from 'react-tv-space-navigation';
import { FocusReporter } from '#ui/lib/focus-report';
import { markGridFocus } from '#ui/lib/perf';
import { clipStyles, OVERSCAN } from '../clip';

const NO_POINTER = { pointerEvents: 'none' } as const;

import { useWheelScroll } from './use-wheel-rows';

interface VirtualGridProps<T> {
  data: readonly T[];
  columns: number;
  /** Row pitch in px (tile height + gap); rows must share a single height, since
   *  scroll offsets are computed from it up front. */
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactElement;
  /** Scrolls with the first row; needs `headerHeight` set alongside it. */
  header?: ReactElement;
  headerHeight?: number;
  rowStyle?: ViewStyle;
  /** The viewport that clips — give it a bounded height (`flex: 1`) or nothing scrolls. */
  style?: ViewStyle;
  /** Padding for the rows, not the viewport (there it would clip into them). */
  contentStyle?: ViewStyle;
  onEndReached?: () => void;
  /** Opens the list on this ROW (not item index) with focus, via the list's ref
   *  since the row isn't mounted yet for `autoFocus` to reach. */
  initialIndex?: number;
}

/**
 * A vertically scrolling grid of fixed-size tiles, rendering only the rows near
 * the viewport.
 *
 * The library translates its content rather than scrolling a real viewport, so
 * nothing clips without this wrapper's `clipStyles.column` box.
 */
function VirtualGrid<T>({
  data,
  columns,
  itemHeight,
  renderItem,
  header,
  headerHeight,
  rowStyle,
  style,
  contentStyle,
  onEndReached,
  initialIndex,
}: Readonly<VirtualGridProps<T>>) {
  const list = useRef<SpatialNavigationVirtualizedListRef>(null);
  const viewport = useRef<View>(null);

  // Mount-only: this is where the list OPENS. Re-running on prop change would
  // yank focus back out from under the D-pad.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening position, not a binding.
  useEffect(() => {
    if (initialIndex) list.current?.focus(initialIndex);
  }, []);

  const lastRow = Math.max(0, Math.ceil(data.length / columns) - 1);
  // While a gesture runs (fraction non-null) the pointer is shut out, or the
  // navigator would focus whatever slides beneath the stationary cursor.
  const fraction = useWheelScroll(viewport, list, lastRow, header ? 1 : 0, itemHeight);

  return (
    <View style={style} ref={viewport}>
      {/* Inert on the inner clip, not the viewport: the wheel listener lives on
          the viewport's node, and pointer-events none there would drop the pan
          events too. */}
      <View style={[clipStyles.column, fraction === null ? null : NO_POINTER]}>
        {/* The library's ref type omits `| null`, which every real ref has before it attaches. */}
        <SpatialNavigationVirtualizedGrid
          ref={list as RefObject<SpatialNavigationVirtualizedListRef>}
          data={data as T[]}
          numberOfColumns={columns}
          itemHeight={itemHeight}
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
          renderItem={({ item, index }) => (
            // Reports which cell took focus, for the on-screen read-out: a
            // remote bug on a television has no inspector to ask.
            <FocusReporter
              onFocus={() => markGridFocus(Math.floor(index / columns), index % columns)}
            >
              {renderItem(item, index)}
            </FocusReporter>
          )}
        />
      </View>
    </View>
  );
}

export type { VirtualGridProps };
export { VirtualGrid };
