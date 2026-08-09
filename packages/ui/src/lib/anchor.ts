// Viewport placement for an anchored panel (a select's listbox, an action
// menu): under the trigger, clamped to the viewport, flipped above when below
// has no room to breathe. Web only - the callers are the pointer presentations.

export interface AnchorPlacement {
  left: number;
  /** Set when the panel hangs under the trigger. */
  top?: number;
  /** Set when the panel flipped above: its BOTTOM edge is pinned to the
   *  trigger, so a panel shorter than the height budget still sits against
   *  it instead of floating detached. */
  bottom?: number;
  /** The panel's MINIMUM width: the trigger's own, or the caller's floor. */
  width: number;
  /** Set when the panel may grow past `width` to fit its content: how far it
   *  can grow before it would reach the viewport edge. */
  maxWidth?: number;
  maxHeight: number;
}

import { webWindow } from '#ui/lib/dom';

export const ANCHOR_GAP = 6;
const EDGE = 12;
const MIN_ROOM = 160;

export function placeUnder(
  trigger: HTMLElement,
  at: {
    /** Panel width: the trigger's own (a select) or a fixed minimum (a menu). */
    minWidth: number;
    matchWidth?: boolean;
    maxHeight: number;
    align?: 'start' | 'end';
    /** Let the panel size to its content above that width, so a row wider
     *  than the trigger is not truncated. */
    grow?: boolean;
  },
): AnchorPlacement {
  const view = webWindow();
  const rect = trigger.getBoundingClientRect();
  const width = at.matchWidth ? Math.max(rect.width, at.minWidth) : at.minWidth;
  if (!view)
    return { left: rect.left, top: rect.bottom + ANCHOR_GAP, width, maxHeight: at.maxHeight };
  const below = view.innerHeight - rect.bottom - ANCHOR_GAP - EDGE;
  const above = rect.top - ANCHOR_GAP - EDGE;
  const flip = below < MIN_ROOM && above > below;
  const maxHeight = Math.min(at.maxHeight, Math.max(0, flip ? above : below));
  const left = at.align === 'end' ? rect.right - width : rect.left;
  const clampedLeft = Math.max(EDGE, Math.min(left, view.innerWidth - width - EDGE));
  const maxWidth = at.grow ? Math.max(width, view.innerWidth - clampedLeft - EDGE) : undefined;
  if (flip) {
    return {
      left: clampedLeft,
      bottom: view.innerHeight - rect.top + ANCHOR_GAP,
      width,
      maxWidth,
      maxHeight,
    };
  }
  return { left: clampedLeft, top: rect.bottom + ANCHOR_GAP, width, maxWidth, maxHeight };
}
