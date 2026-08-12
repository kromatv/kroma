// The two rows a <Rail.Root> can hold: the growing one it renders for plain
// tile children, and <Rail.List>, the windowed one.
//
// A rail mounts only what is reachable: benchmarked under CPU throttling,
// mounting every tile of a dozen home rails collapses frame rate, so the
// growing row starts with a screenful and grows as focus approaches its end,
// never unmounting what's already been reached (the navigator can only move to
// a node that exists).

import { Children, type ReactElement, type ReactNode, useMemo } from 'react';
import { ScrollView, type ViewStyle } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationView } from 'react-tv-space-navigation';
import { VirtualRail } from '#ui/components/organisms/virtual';
import { RING_ROOM } from '#ui/core/tokens';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRail } from '#ui/lib/focus-scroll';
import { useGrowingCount } from '#ui/lib/use-growing-count';
import { useRail } from './rail-context';

const RAIL_CHUNK = 8;

interface RailListProps {
  /** Tile PITCH: the tile's own width plus the gap after it. The list
   *  positions tiles rather than laying them out, so it has to be told. */
  pitch: number;
  /** The row's height, for the same reason. Focus-ring room is added on top. */
  height: number;
  children: ReactNode;
}

// The cell IS the pitch and a tile fills it (every kit tile is width 100% by
// default), so the tile passes through untouched.
const asTile = (tile: ReactNode) => tile as ReactElement;

/**
 * The windowed row: only the tiles near the viewport exist, so a row of forty
 * costs what a row of eight costs. Worth it for a long row of uniform tiles; a
 * short strip (chips, cast faces) is cheaper mounted whole, which is what
 * `<Rail.Root>` renders for plain children.
 */
function List({ pitch, height, children }: Readonly<RailListProps>) {
  const { gap, inset } = useRail('List');
  const tiles = useMemo(() => Children.toArray(children), [children]);
  const style = useMemo(() => ({ height: height + RING_ROOM * 2 }), [height]);
  // The list translates the whole content and parks the focused tile at the
  // content's origin, so the left inset keeps it off the screen edge; the right
  // one stops the last tile sitting flush against the other edge.
  const contentStyle = useMemo(
    () => ({ paddingLeft: inset, paddingRight: inset, paddingVertical: RING_ROOM }),
    [inset],
  );
  return (
    <VirtualRail
      data={tiles}
      itemWidth={pitch}
      renderItem={asTile}
      gap={gap}
      style={style}
      contentStyle={contentStyle}
    />
  );
}

function GrowingRow({
  grow: growing,
  children,
}: Readonly<{ grow: boolean; children: readonly ReactNode[] }>) {
  const { gap, inset } = useRail('Root');
  // `grow={false}` asks for the whole strip up front: one chunk big enough to
  // hold it, so `isNearEnd` never fires.
  const { count, isNearEnd, grow } = useGrowingCount(
    children.length,
    growing ? RAIL_CHUNK : children.length,
  );
  // Same rule as <Focusable>: no navigator above means this is a thumb (or a
  // bare web page), not a remote.
  const scoped = useInsideFocusScope();
  const rowStyle = { gap, paddingHorizontal: inset, paddingVertical: 12 };

  // No navigator: a plain scrolled row. Everything mounts at once: the
  // unscoped rails are the short ones (chip strips, cast faces); a long
  // uniform row should use <Rail.List> and virtualise instead.
  if (!scoped) return <ScrolledRow contentStyle={rowStyle}>{children}</ScrolledRow>;

  return (
    <FocusRail
      // Keeps the focused tile off the very edge, so there is always a hint of
      // the next one.
      offsetFromStart={inset}
    >
      {/* The scroller scrolls; this is the row itself. A focus ring is drawn
          OUTSIDE the tile's box and a focused tile scales up, so it needs
          vertical room or the ring is clipped. */}
      <SpatialNavigationView direction="horizontal" style={rowStyle}>
        {/* Each tile gets a node keyed by its POSITION, and that is not
            ceremony: the navigator registers nodes in the order they mount,
            and a rail's tiles arrive as the data does. Without a stable slot
            per position, Right walks the row in the order the server answered
            rather than the order you can see. */}
        {children.slice(0, count).map((child, index) => (
          // `onActive`, not `onFocus`: this node is a container, and its tile
          // is what takes the focus. A container asked for `onFocus` is a
          // focusable that can never be focused, and the remote dies on it.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the identity here - it is the slot in the row.
          <SpatialNavigationNode key={index} onActive={isNearEnd(index) ? grow : undefined}>
            {child as ReactElement}
          </SpatialNavigationNode>
        ))}
      </SpatialNavigationView>
    </FocusRail>
  );
}

function ScrolledRow({
  contentStyle,
  children,
}: Readonly<{ contentStyle: ViewStyle; children: ReactNode }>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentStyle}
    >
      {children}
    </ScrollView>
  );
}

export type { RailListProps };
export { GrowingRow, List };
