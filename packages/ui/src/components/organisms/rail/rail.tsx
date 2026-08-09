// <Rail>: a titled horizontal row of tiles, the backbone of the 10-foot home.
// A rail IS a row: the spatial navigator moves between rows vertically and
// inside one horizontally, so nothing needs measuring for that to hold.
//
// <FocusRail> keeps the focused tile in view on every target, including
// browser TVs with no OS focus engine. It exists separately from the
// navigator's own handling because React 19 spreads `ref` like any other
// prop: the navigator's ref and <Focusable>'s own ref on the same view can't
// coexist, and the last one written silently wins.
//
// A rail also mounts only what is reachable: benchmarked under CPU throttling,
// mounting every tile of a dozen home rails collapses frame rate, so a rail
// starts with a screenful and grows as focus approaches its end, never
// unmounting what's already been reached (the navigator can only move to a
// node that exists).

import { Children, type ReactElement, type ReactNode, useMemo } from 'react';
import { ScrollView, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationView } from 'react-tv-space-navigation';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { VirtualRail } from '#ui/components/organisms/virtual';
import { gutter } from '#ui/core/tokens';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRail } from '#ui/lib/focus-scroll';
import { useGrowingCount } from '#ui/lib/use-growing-count';

interface RailProps {
  title?: string;
  /** Override the title's type. The home rows run larger than the default h2. */
  titleStyle?: StyleProp<TextStyle>;
  gap?: number;
  /** Defaults to the overscan-safe 10-foot gutter, applied inside the
   *  scroller so the first tile's focus ring is never clipped by the
   *  viewport edge. */
  inset?: number;
  /**
   * Virtualise this rail: pass the tile pitch (its width plus the gap after
   * it) and the row's height, since the list positions tiles rather than
   * laying them out. Opt-in per call site — worth it only for long rows; a
   * short strip (chips, cast faces) is cheaper mounted whole.
   */
  item?: { width: number; height: number };
  /**
   * Mount every child at once instead of a chunk at a time. The growing
   * window suits a rail of dozens of posters where only a few are ever
   * visible; a short strip of controls (e.g. sort + genre chips) should pass
   * `grow={false}` so it doesn't open showing just its first chunk.
   */
  grow?: boolean;
  children: ReactNode;
}

const RAIL_CHUNK = 8;

const RING_ROOM = 12;

function Rail({
  title,
  titleStyle,
  gap = 24,
  inset = gutter.tv,
  item,
  grow: growing = true,
  children,
}: Readonly<RailProps>) {
  const tiles = useMemo(() => Children.toArray(children), [children]);
  // `grow={false}` asks for the whole strip up front: one chunk big enough to
  // hold it, so `isNearEnd` never fires.
  const { count, isNearEnd, grow } = useGrowingCount(
    tiles.length,
    growing ? RAIL_CHUNK : tiles.length,
  );
  // Same rule as <Focusable>: no navigator above means this is a thumb (or a
  // bare web page), not a remote.
  const scoped = useInsideFocusScope();
  const heading = title ? (
    <Txt variant="h2" style={[{ paddingLeft: inset }, titleStyle]}>
      {title}
    </Txt>
  ) : null;

  // Only the tiles near the viewport exist, so a row of forty costs what a
  // row of eight costs. The list translates the whole content and parks the
  // focused tile at the content's origin, so the left inset keeps it off the
  // screen edge.
  if (item) {
    return (
      <Box gap={16}>
        {heading}
        <VirtualRail
          data={tiles}
          itemWidth={item.width}
          // The pitch is the cell; a tile fills it (every kit tile is width
          // 100% by default), and the gap is padding applied by the cell
          // itself so a tile stays one view.
          renderItem={(tile) => tile as ReactElement}
          gap={gap}
          style={{ height: item.height + RING_ROOM * 2 }}
          // Right padding stops the last tile sitting flush against the edge
          // once the row is walked to its end.
          contentStyle={{ paddingLeft: inset, paddingRight: inset, paddingVertical: RING_ROOM }}
        />
      </Box>
    );
  }

  // No navigator: a plain scrolled row. Everything mounts at once — the
  // unscoped rails are the short ones (chip strips, cast faces); a long
  // uniform row should pass `item` and virtualise instead.
  if (!scoped) {
    return (
      <Box gap={16}>
        {heading}
        <ScrolledRow contentStyle={{ gap, paddingHorizontal: inset, paddingVertical: 12 }}>
          {tiles}
        </ScrolledRow>
      </Box>
    );
  }

  return (
    <Box gap={16}>
      {heading}
      <FocusRail
        // Keeps the focused tile off the very edge, so there is always a hint of
        // the next one.
        offsetFromStart={inset}
      >
        {/* The scroller scrolls; this is the row itself. A focus ring is drawn
            OUTSIDE the tile's box and a focused tile scales up, so it needs
            vertical room or the ring is clipped. */}
        <SpatialNavigationView
          direction="horizontal"
          style={{ gap, paddingHorizontal: inset, paddingVertical: 12 }}
        >
          {/* Each tile gets a node keyed by its POSITION, and that is not
              ceremony: the navigator registers nodes in the order they mount,
              and a rail's tiles arrive as the data does. Without a stable slot
              per position, Right walks the row in the order the server answered
              rather than the order you can see. */}
          {tiles.slice(0, count).map((child, index) => (
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
    </Box>
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

export type { RailProps };
export { Rail };
