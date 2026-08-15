// One region of a resizable group, and the hook a caller reaches for when the
// seams are not enough.
//
// The share is spent as `flexGrow` against a zero basis rather than as a width,
// which is what lets a group lay itself out correctly on its very first frame -
// before anything has been measured, and on a television where nothing ever is.

import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { usePanelIndex, useResizableGroup } from './resizable-context';
import {
  collapsedAt,
  type PanelLimit,
  percentOf,
  pointsOf,
  type ResizableSize,
} from './resizable-layout';

/** What a panel reports about itself alongside its new size. */
interface ResizablePanelDetails {
  /** The share in points, measured against the group. `0` until the group has
   *  been laid out once. */
  points: number;
  collapsed: boolean;
}

interface ResizablePanelProps {
  /** The share the panel opens at: a percentage (`25`) or points (`'280px'`).
   *  Panels stating none split what the stating ones leave. */
  defaultSize?: ResizableSize;
  /** The floor a drag stops at. Defaults to nothing, so a panel can be squeezed
   *  to zero unless it says otherwise. */
  minSize?: ResizableSize;
  maxSize?: ResizableSize;
  /** Lets a drag past `minSize` shut the panel to `collapsedSize` instead of
   *  stopping at the floor; halfway between the two is where it snaps. */
  collapsible?: boolean;
  /** Where a collapsed panel rests. `0` by default, which hides it outright. */
  collapsedSize?: ResizableSize;
  /** The share (0-100) after every change, dragged or clamped. */
  onResize?: (size: number, details: ResizablePanelDetails) => void;
  /** Render the share onto the one child instead of a panel <View> of its own
   *  (see lib/slot). The panel's share then wins the child's own sizing, which
   *  is the point: the seam decides how wide a panel is. */
  asChild?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** What `useResizablePanel` hands the subtree inside a panel. */
interface ResizablePanelState {
  /** The panel's share of the group, 0-100. */
  size: number;
  points: number;
  collapsed: boolean;
  collapse: () => void;
  expand: () => void;
  resize: (size: ResizableSize) => void;
}

const EMPTY_LIMIT: PanelLimit = { min: 0, max: 100, collapsedSize: 0, collapsible: false };

/**
 * The live state of the panel this is called inside, for a control several
 * levels down that has to drive it - a "hide the inspector" button that is not
 * the seam. Throws outside a `<Resizable.Panel>`.
 */
function useResizablePanel(): ResizablePanelState {
  const at = usePanelIndex();
  const group = useResizableGroup('Panel');
  const size = group.layout[at] ?? 0;
  const limit = group.limits[at] ?? EMPTY_LIMIT;
  const spec = group.specs[at];
  const { available, resize } = group;

  return useMemo(() => {
    const opened = percentOf(spec?.defaultSize, available) ?? limit.min;
    return {
      size,
      points: pointsOf(size, available),
      collapsed: collapsedAt(size, limit),
      collapse: () => resize(at, limit.collapsedSize),
      expand: () => resize(at, Math.max(limit.min, opened)),
      resize: (next: ResizableSize) => resize(at, percentOf(next, available) ?? size),
    };
  }, [at, available, limit, resize, size, spec]);
}

/**
 * One region of a `<Resizable.Root>`. Write the panels and the seams between
 * them in order; a panel takes its place from where it sits.
 */
function Panel({ asChild, onResize, style, children }: Readonly<ResizablePanelProps>) {
  const at = usePanelIndex();
  const group = useResizableGroup('Panel');
  const size = group.layout[at] ?? 0;
  const limit = group.limits[at] ?? EMPTY_LIMIT;
  const collapsed = collapsedAt(size, limit);
  const points = pointsOf(size, group.available);

  const report = useEffectEvent(() => onResize?.(size, { points, collapsed }));
  const was = useRef<number | null>(null);
  useEffect(() => {
    if (was.current === size) return;
    was.current = size;
    report();
  }, [size]);

  return (
    <Box asChild={asChild} style={[shareOf(size), style]}>
      {children}
    </Box>
  );
}

// `minWidth`/`minHeight` at zero because a flex child on the web refuses to
// shrink under its own content without them, and a panel whose contents are
// wider than its share is the normal case here.
function shareOf(size: number): ViewStyle {
  return {
    flexGrow: size,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  };
}

export type { ResizablePanelDetails, ResizablePanelProps, ResizablePanelState };
export { Panel, useResizablePanel };
