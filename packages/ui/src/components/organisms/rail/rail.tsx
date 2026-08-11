// <Rail>: a titled horizontal row of tiles, the backbone of the 10-foot home.
// A rail IS a row: the spatial navigator moves between rows vertically and
// inside one horizontally, so nothing needs measuring for that to hold.
//
// Yoga has no `order`, so the Root sorts its direct children once - the same
// shape <PageHeader> and <ListRow> take - and publishes the two measurements a
// heading and a row have to agree on through context.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { gutter, type TypeRole } from '#ui/core/tokens';
import { RailContext, useRail } from './rail-context';
import { GrowingRow, List, type RailListProps } from './rail-row';

/**
 * A rail's gap between tiles. Tighter than what a focused tile puts outside
 * itself (it grows by its focus scale and then wears a ring RING_ROOM beyond
 * that), so a focused tile reaches over its neighbours - which is why the cell
 * holding the focus is lifted above them rather than fenced off from them.
 */
const RAIL_GAP = 16;

interface RailTitleProps {
  /** The heading's type role. The home rows run larger than the default h2. */
  variant?: TypeRole;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}

/** The row's heading, inset to the same gutter its first tile starts at. */
function Title({ variant = 'h2', style, children }: Readonly<RailTitleProps>) {
  const { inset } = useRail('Title');
  return (
    <Text variant={variant} style={[{ paddingLeft: inset }, style]}>
      {children}
    </Text>
  );
}

interface RailRootProps {
  /** Sugar for a `<Rail.Title>`, so the common row is one line. */
  title?: string;
  gap?: number;
  /** Defaults to the overscan-safe 10-foot gutter, applied inside the
   *  scroller so the first tile's focus ring is never clipped by the
   *  viewport edge. */
  inset?: number;
  /**
   * Mount every tile at once instead of a chunk at a time. The growing window
   * suits a rail of dozens of posters where only a few are ever visible; a
   * short strip of controls (e.g. sort + genre chips) should pass
   * `grow={false}` so it doesn't open showing just its first chunk. It says
   * nothing about a `<Rail.List>`, which windows itself.
   */
  grow?: boolean;
  /** A `<Rail.Title>` and a `<Rail.List>` must be DIRECT children to take
   *  their slot; every other child is a tile of the growing row. Given a
   *  `<Rail.List>`, it IS the row and stray tiles beside it are dropped. */
  children?: ReactNode;
}

interface Sorted {
  title: ReactNode[];
  list: ReactNode[];
  tiles: ReactNode[];
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { title: [], list: [], tiles: [] };
  for (const child of Children.toArray(children)) {
    const part = isValidElement(child) ? child.type : null;
    if (part === Title) at.title.push(child);
    else if (part === List) at.list.push(child);
    else at.tiles.push(child);
  }
  return at;
}

function Root({
  title,
  gap = RAIL_GAP,
  inset = gutter.tv,
  grow = true,
  children,
}: Readonly<RailRootProps>) {
  const ctx = useMemo(() => ({ gap, inset }), [gap, inset]);
  const at = useMemo(() => sort(children), [children]);
  return (
    <RailContext.Provider value={ctx}>
      <Box gap={16}>
        {title === undefined ? null : <Title>{title}</Title>}
        {at.title}
        {at.list.length > 0 ? at.list : <GrowingRow grow={grow}>{at.tiles}</GrowingRow>}
      </Box>
    </RailContext.Provider>
  );
}

/**
 * A titled horizontal row of tiles.
 *
 * ```tsx
 * <Rail.Root title="Reprendre">{cards}</Rail.Root>
 *
 * <Rail.Root>
 *   <Rail.Title variant="subheadingTv">Reprendre</Rail.Title>
 *   <Rail.List pitch={320 + RAIL_GAP} height={180}>
 *     {cards}
 *   </Rail.List>
 * </Rail.Root>
 * ```
 */
const Rail = { Root, Title, List };

export type { RailListProps, RailRootProps, RailTitleProps };
export { RAIL_GAP, Rail };
