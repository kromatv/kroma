import { useCallback, useContext, useEffect, useRef } from 'react';
import { type View } from 'react-native';
import { usePointerDriving } from '#ui/lib/input-source';
import {
  type Anchor,
  PageScrollContext,
  RailScrollContext,
  RowContext,
} from '#ui/lib/reveal-contexts';

/**
 * What a control uses to ask to be shown when it takes the focus: the page
 * reveals its row (or the control when it is in none), the rail the control.
 */
function useRevealOnFocus(self: Anchor): () => void {
  return useRevealOnFocusBy(self, usePointerDriving());
}

/** {@link useRevealOnFocus} for a caller that already holds the input source's `pointerDriving`. */
function useRevealOnFocusBy(self: Anchor, pointerDriving: () => boolean): () => void {
  const page = useContext(PageScrollContext);
  const rail = useContext(RailScrollContext);
  const row = useContext(RowContext);
  return useCallback(() => {
    // A focus the pointer produced reveals nothing: scrolling under a cursor
    // that has not moved cascades into the page walking off on its own.
    if (pointerDriving()) return;
    rail?.(self);
    page?.(row ?? self);
  }, [page, rail, row, self, pointerDriving]);
}

/**
 * The anchor of a row whose focus is a prop rather than the navigator's (a
 * player panel's rows): the page reveals it the moment `focused` turns true.
 */
function useRevealWhenFocused(focused: boolean): (view: View | null) => void {
  const self = useRef<View>(null);
  const reveal = useRevealOnFocus(self);
  useEffect(() => {
    if (focused) reveal();
  }, [focused, reveal]);
  return useCallback((view: View | null) => {
    self.current = view;
  }, []);
}

export { useRevealOnFocus, useRevealOnFocusBy, useRevealWhenFocused };
