// <VirtualGrid>: the browse screens' poster grid, for a library of thousands.
//
// The row that used to live here is now `virtual-rail.tsx`, which owns its own
// motion; this keeps the navigator library's virtualised grid.
//
// A television's cost follows the number of MOUNTED controls, and a real library
// is thousands of titles. What the kit did before was defer them - render a
// chunk, render the next as focus approached the end - which keeps the first
// screen cheap and makes the last one ruinous: nothing is ever unmounted, so
// walking to the bottom of a 2000-title grid leaves 2000 tiles in the tree.
// Deferring is not virtualisation; it only postpones the bill.
//
// The reason it was deferred rather than virtualised: the spatial navigator can
// only move focus to a node that EXISTS, so unmounting off-screen rows would
// make the D-pad stop dead at the edge of the viewport. That is true of a plain
// list - and it is exactly what react-tv-space-navigation's own virtualised
// components solve, by registering a VIRTUAL node per column/slot that outlives
// the item rendered into it. Focus moves to the virtual node, the list scrolls,
// the real item mounts underneath it.
//
// They also fix a second thing, and it is not a side effect: a virtual column is
// registered with `useMeForIndexAlign`, which is LRUD's "keep the column". Down
// from the fourth tile of a row lands on the fourth tile of the next row instead
// of on whichever tile that row happened to be left on - the diagonal drift that
// made the grids and the on-screen keyboard feel broken.

import { type ReactElement, type RefObject, useEffect, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  SpatialNavigationVirtualizedGrid,
  type SpatialNavigationVirtualizedListRef,
} from 'react-tv-space-navigation';
import { clipStyles, OVERSCAN } from './clip';
import { useWheelScroll } from './use-wheel-rows';

interface VirtualGridProps<T> {
  data: readonly T[];
  /** Tiles per row. */
  columns: number;
  /** Row pitch in pixels: the tile's own height PLUS the gap beneath it. The
   *  list has to know this up front - it is what the scroll offsets are computed
   *  from - so a virtualised grid cannot have rows of different heights. */
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactElement;
  /** Rendered above the first row, scrolling with it. Needs `headerHeight`. */
  header?: ReactElement;
  headerHeight?: number;
  /** Applied to every row (the gap between tiles lives here). */
  rowStyle?: ViewStyle;
  /** The grid's own box on the page. It is the VIEWPORT, and it is what clips.
   *  Give it a bounded height (`flex: 1`) or nothing scrolls. */
  style?: ViewStyle;
  /** Padding around the rows. Belongs to the content, not to the viewport: on
   *  the viewport it would inset the clip and shave the rows. The TOP padding
   *  doubles as the focused first row's ring room - see `clipStyles.column`. */
  contentStyle?: ViewStyle;
  /** Fetch the next page. Fires a few rows before the end. */
  onEndReached?: () => void;
  /**
   * Open the list on this ROW rather than at the top, focus and all.
   *
   * The one thing a long picker cannot do without: a language list is two
   * hundred rows, and someone who already chose Swedish should not have to walk
   * back down to it to see that it is ticked. It goes through the list's ref
   * because the row is not mounted yet - `autoFocus` on a row the window has
   * not reached is `autoFocus` on nothing.
   *
   * A row index, not an item index. They are the same list when `columns` is 1,
   * which is what the pickers use.
   */
  initialIndex?: number;
}

/**
 * A vertically scrolling grid of fixed-size tiles, rendering only the rows near
 * the viewport. The browse screens' poster grid.
 *
 * The wrapper is load-bearing, and it is the one thing about these components
 * that is not obvious. A virtualised list does not scroll: it TRANSLATES its
 * content, and the library applies the `style` it is given to that content
 * rather than to a viewport around it. So there is no box that clips unless the
 * caller provides one - without it the rows above the resting position are drawn
 * exactly where they land, which is on top of whatever chrome sits above the
 * grid. This is that box (`clipStyles.column` - flush at the top, because the
 * chrome above a vertical list is exactly what the bleed must not show through).
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

  // After mount, so the list has registered its virtual nodes and can scroll to
  // one. Mount-only on purpose: this is where the list OPENS, and re-running it
  // when the prop changes would yank the focus back out from under the D-pad.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening position, not a binding.
  useEffect(() => {
    if (initialIndex) list.current?.focus(initialIndex);
  }, []);

  const lastRow = Math.max(0, Math.ceil(data.length / columns) - 1);
  // Free wheel-scrolling, snap on stop. While a gesture runs (fraction non-null)
  // the pointer is shut out: the tiles are moving under a stationary cursor, and
  // the navigator would otherwise focus whatever slides beneath it.
  const fraction = useWheelScroll(viewport, list, lastRow, header ? 1 : 0, itemHeight);

  return (
    <View style={style} ref={viewport}>
      {/* The INNER box goes inert during a gesture, not the viewport: the wheel
          listener lives on the viewport's node, and pointer-events none there
          would drop the very events that drive the pan (they would fall through
          to whatever is behind the grid). On the clip, hover can no longer
          reach the tiles sliding under the cursor, while the wheel still lands
          on the viewport - the same split the rail's MovingRow makes. */}
      <View style={clipStyles.column} pointerEvents={fraction === null ? 'auto' : 'none'}>
        {/* The cast is the library's ref typing, which says RefObject<T> where
            every real React ref is RefObject<T | null> until it attaches. */}
        <SpatialNavigationVirtualizedGrid
          ref={list as RefObject<SpatialNavigationVirtualizedListRef>}
          data={data as T[]}
          numberOfColumns={columns}
          itemHeight={itemHeight}
          additionalRenderedRows={OVERSCAN}
          header={header}
          headerSize={headerHeight}
          rowContainerStyle={rowStyle}
          style={contentStyle}
          freeScrollFraction={fraction}
          onEndReached={onEndReached}
          renderItem={({ item, index }) => renderItem(item, index)}
        />
      </View>
    </View>
  );
}

export type { VirtualGridProps };
export { VirtualGrid };
