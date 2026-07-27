// <Rail>: a titled horizontal row of tiles, the backbone of the 10-foot home.
//
// A rail IS a row, and saying so is the whole of its navigation: the spatial
// navigator moves between rows vertically and inside one horizontally, so Down
// from the hero lands on the tile beneath it and Up from the fourth tile comes
// back to what is above the fourth tile. Nothing is measured, so nothing drifts
// while the scroller animates.
//
// <FocusRail> keeps the focused tile in view, on every target - the browser TVs
// included, where there is no OS focus engine to do it. It is ours rather than
// the navigator's because the navigator's scroller measures the focused control
// through a ref it installs on that control's view, and <Focusable> needs its
// own ref on that same view: React 19 spreads `ref` like any other prop, so the
// last one written wins and the library's was always the one that lost. Silently
// - the rails simply never scrolled, and the focus walked off the side of the
// screen while scrollLeft stayed at 0.
//
// A rail also mounts only what is reachable. That is not a micro-optimisation:
// measured on the bench (clients/tv-build/perf-bench.ts, CPU throttled to a
// television's), 160 mounted controls hold 96fps and 480 collapse to 46fps with
// 73ms frames. A home screen of a dozen rails is squarely in the second case,
// while about six tiles of each rail are ever on screen. So a rail starts with a
// screenful and grows as the focus approaches its end - never unmounting what
// has been reached, because the navigator can only move to a node that exists.

import { Children, type ReactElement, type ReactNode, useMemo } from 'react';
import { ScrollView, type StyleProp, type TextStyle } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationView } from 'react-tv-space-navigation';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { VirtualRail } from '#ui/components/organisms/virtual';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusRail } from '#ui/lib/focus-scroll';
import { gutter } from '#ui/lib/tokens';
import { useGrowingCount } from '#ui/lib/use-growing-count';

interface RailProps {
  title?: string;
  /** Override the title's type. The home rows run larger than the default h2. */
  titleStyle?: StyleProp<TextStyle>;
  /** Gap between tiles. */
  gap?: number;
  /** Side padding. Defaults to the overscan-safe 10-foot gutter, and it is
   *  applied INSIDE the scroller so the first tile's focus ring is never
   *  clipped by the viewport edge. */
  inset?: number;
  /**
   * Virtualise this rail: the tile PITCH (its width PLUS the gap after it) and
   * the row's height, both of which the list needs up front because it positions
   * its tiles rather than laying them out.
   *
   * Opt-in per call site, because it is only worth it where the row is long. A
   * home row of forty films is the case it exists for; a row of six chips or
   * four cast faces is cheaper mounted whole than measured, and those rows do
   * not all agree on a tile width anyway.
   */
  item?: { width: number; height: number };
  /**
   * Mount every child at once instead of a chunk at a time.
   *
   * The growing window is for a RAIL - dozens of posters, of which you only ever
   * see six, and whose cost is worth deferring. A short strip of controls is not
   * that: the browse screens' sort + genre chips are one `Rail`, and growing
   * them meant the strip opened showing only its first `RAIL_CHUNK` children -
   * four sort chips, a divider, "all genres" and then just TWO genres - with the
   * rest appearing only once focus had walked to the end. A filter you cannot
   * see is a filter that does not exist, so those pass `grow={false}`.
   */
  grow?: boolean;
  children: ReactNode;
}

/** A screenful and a bit: five tiles fit on the 1920 stage, and the sixth is the
 * one peeking at the edge that tells you the row continues. */
const RAIL_CHUNK = 8;

/** Vertical room for the focus ring, which is drawn OUTSIDE the tile's box and
 * on a tile that has scaled up. Without it the ring is clipped by the row. */
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
  // hold it, so `isNearEnd` never fires and nothing is ever deferred.
  const { count, isNearEnd, grow } = useGrowingCount(
    tiles.length,
    growing ? RAIL_CHUNK : tiles.length,
  );
  // Same rule as <Focusable>: no navigator above means this is a thumb (or a
  // bare web page), not a remote. See the unscoped return below.
  const scoped = useInsideFocusScope();
  const heading = title ? (
    <Txt variant="h2" style={[{ paddingLeft: inset }, titleStyle]}>
      {title}
    </Txt>
  ) : null;

  // The virtualised rail. Only the tiles near the viewport exist, so a row of
  // forty costs what a row of eight costs - and, unlike the growing rail below,
  // it costs that much for as long as you keep walking rather than accumulating
  // everything you have passed. The left padding is what keeps the focused tile
  // off the screen edge: the list translates the whole content and parks the
  // focused tile at the content's origin, so an inset there is an inset from the
  // viewport.
  if (item) {
    return (
      <Box gap={16}>
        {heading}
        <VirtualRail
          data={tiles}
          itemWidth={item.width}
          // The pitch is the cell; a tile fills it (every kit tile is width
          // 100% by default) and the gap is padding inside it - applied by the
          // cell itself rather than by a wrapper here, so a tile is one view.
          renderItem={(tile) => tile as ReactElement}
          gap={gap}
          style={{ height: item.height + RING_ROOM * 2 }}
          // Both sides. The left is what keeps the focused tile off the edge
          // (above); the right is what stops the LAST tile sitting flush against
          // it once the row is walked to its end - the same gutter the unscoped
          // and non-virtualised rails get from `paddingHorizontal`.
          contentStyle={{ paddingLeft: inset, paddingRight: inset, paddingVertical: RING_ROOM }}
        />
      </Box>
    );
  }

  // No navigator: the rail is a plain scrolled row. Everything mounts at once -
  // the growing window exists for the navigator's registration order and is
  // driven by focus arriving near the end, neither of which exists here - and
  // that is fine, because the unscoped rails are the short ones (chip strips,
  // cast faces); a long uniform row should be passing `item` and virtualising.
  if (!scoped) {
    return (
      <Box gap={16}>
        {heading}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap, paddingHorizontal: inset, paddingVertical: 12 }}
        >
          {tiles}
        </ScrollView>
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

export type { RailProps };
export { Rail };
