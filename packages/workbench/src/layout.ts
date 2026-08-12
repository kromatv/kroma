// Where the workbench puts its three regions at a given window size.
//
// The workbench is one screen with three jobs on it - pick a component, look at
// it, adjust it - and there is not always room for all three side by side. A
// media query cannot help here (the native builds have no CSS), and shrinking
// all three together is what produced a 400pt canvas squeezed between two full
// -width panels. So the sizes live in ONE pure function of the window, the
// regions MOVE rather than shrink, and every consumer reads the same numbers.
//
// The rule at each step is that the canvas keeps its width: the list becomes a
// drawer before the component being inspected gets narrow, and the inspector
// docks under the canvas rather than eating into it.
//
// What a reader has DRAGGED is not here: the shell hands these numbers to
// <Resizable> as the size each region opens at, and the group owns everything
// after that - the floors, what the window can spare, and the wish surviving a
// smaller screen.

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** `wide` is a desk, `medium` a laptop or a tablet in landscape, `compact` a
 * phone. A television is always `wide`. */
type LayoutMode = 'wide' | 'medium' | 'compact';

// The window widths at which a region has to move. Chosen from the regions
// themselves rather than from a device chart: below 1240 the sidebar, a 320
// inspector and a readable canvas no longer fit on one line, and below 880
// the sidebar and the canvas do not either.
const BREAKPOINTS = { wide: 1240, medium: 880 } as const;

interface WorkbenchLayout {
  mode: LayoutMode;
  nav: 'column' | 'drawer';
  panel: 'side' | 'below';
  navWidth: number;
  panelWidth: number;
  // Ignored while it is a column.
  panelHeight: number;
  gutter: number;
  stagePad: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

function modeFor(width: number): LayoutMode {
  if (width >= BREAKPOINTS.wide) return 'wide';
  return width >= BREAKPOINTS.medium ? 'medium' : 'compact';
}

// The page gutter per mode: the canvas header, tabs and code drawer align to
// it, and it is the first thing to give when the window narrows.
const GUTTER = { wide: 28, medium: 22, compact: 16 } as const;

// What an unmeasured window is assumed to be. A width of 0 means "not
// measured yet", not "a very narrow phone": jsdom reports it, and so does a
// native view asked before its first layout. Falling back to a desk keeps a
// test and a first frame on the layout the workbench spends most of its life
// in, rather than flashing the drawer shell for one commit.
const ASSUMED = { width: 1440, height: 900 } as const;

/** What a drag may not take from the canvas: enough width for the phone
 * viewport (390 plus its bezel) at 1:1, and enough height for the toolbar, the
 * heading, the tab row and a band of stage under them. */
const MIN_CANVAS = { width: 480, height: 320 } as const;

/** A dragged region's own floor - the size its contents stop working at, well
 * under the size it is computed at. There is no matching ceiling: how large a
 * region may get is whatever the canvas can spare, which is what the canvas's
 * own floor already says. */
const REGION_MIN = { nav: 200, panel: 280, dock: 160 } as const;

/** What the docked inspector shows when it is shut: its tab row and nothing
 * else. */
const DOCK_COLLAPSED = 38;

/** The layout for a window of this size. Pure, so it is testable without a
 * renderer and identical on every target. */
function layoutFor(rawWidth: number, rawHeight: number): WorkbenchLayout {
  const width = rawWidth || ASSUMED.width;
  const height = rawHeight || ASSUMED.height;
  const mode = modeFor(width);
  const compact = mode === 'compact';
  return {
    mode,
    nav: compact ? 'drawer' : 'column',
    panel: mode === 'wide' ? 'side' : 'below',
    // The drawer is wider than the column it replaces - it is over the canvas
    // rather than beside it, so the width costs nothing - but never the whole
    // window, because the sliver of canvas behind it is what says it is a drawer.
    navWidth: compact ? clamp(width * 0.82, 240, 330) : clamp(width * 0.19, 232, 288),
    // The inspector's column grows a little on a big screen: the code samples in
    // it are the widest thing the workbench renders.
    panelWidth: clamp(width * 0.23, 320, 400),
    // Docked, it takes a third of the height and no more, so the canvas above it
    // stays the larger half of the split.
    panelHeight: clamp(height * 0.34, 220, 380),
    gutter: GUTTER[mode],
    stagePad: compact ? 16 : 32,
    width,
    height,
  };
}

/** The live layout. Re-reads on rotation and on every window resize. */
function useLayout(): WorkbenchLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => layoutFor(width, height), [width, height]);
}

export type { WorkbenchLayout };
export { BREAKPOINTS, DOCK_COLLAPSED, layoutFor, MIN_CANVAS, REGION_MIN, useLayout };
