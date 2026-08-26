// Viewport placement for an anchored panel (a select's listbox, an action
// menu): under the trigger, clamped to the viewport, flipped above when below
// has no room to breathe.

/** A trigger's box, in viewport coordinates: what `getBoundingClientRect` and
 *  `measureInWindow` both report. */
export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchorViewport {
  width: number;
  height: number;
}

export interface AnchorPlacement {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxWidth?: number;
  maxHeight: number;
}

export const ANCHOR_GAP = 6;
const EDGE = 12;
const MIN_ROOM = 160;

/** `view` is null where nothing has been measured yet (a server render, a
 *  target that reports no window): the panel then sits against the trigger
 *  with nothing clamped. */
export function placeUnder(
  trigger: AnchorRect,
  view: AnchorViewport | null,
  at: {
    minWidth: number;
    matchWidth?: boolean;
    maxHeight: number;
    align?: 'start' | 'end';
    grow?: boolean;
  },
): AnchorPlacement {
  const bottomEdge = trigger.top + trigger.height;
  const width = at.matchWidth ? Math.max(trigger.width, at.minWidth) : at.minWidth;
  if (!view)
    return { left: trigger.left, top: bottomEdge + ANCHOR_GAP, width, maxHeight: at.maxHeight };
  const below = view.height - bottomEdge - ANCHOR_GAP - EDGE;
  const above = trigger.top - ANCHOR_GAP - EDGE;
  const flip = below < MIN_ROOM && above > below;
  const maxHeight = Math.min(at.maxHeight, Math.max(0, flip ? above : below));
  const left = at.align === 'end' ? trigger.left + trigger.width - width : trigger.left;
  const clampedLeft = Math.max(EDGE, Math.min(left, view.width - width - EDGE));
  const maxWidth = at.grow ? Math.max(width, view.width - clampedLeft - EDGE) : undefined;
  if (flip) {
    return {
      left: clampedLeft,
      bottom: view.height - trigger.top + ANCHOR_GAP,
      width,
      maxWidth,
      maxHeight,
    };
  }
  return { left: clampedLeft, top: bottomEdge + ANCHOR_GAP, width, maxHeight, maxWidth };
}
