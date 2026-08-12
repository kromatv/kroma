// The machinery every anchored panel shares (a select's listbox, an action
// menu, a searchable picker): where the panel goes and how it follows its
// trigger through scrolls, who holds the DOM focus for its lifetime, and the
// roving-highlight keyboard. The panels themselves stay in their components;
// this file is only what was being written three times.

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type AnchorPlacement, placeUnder } from '#ui/lib/anchor';
import { webWindow } from '#ui/lib/dom';
import { armEscapeGuard } from '#ui/lib/escape-guard';

// `position: fixed` rides the viewport; React Native's types don't know it.
const FIXED = 'fixed' as 'absolute';

/** The click-away layer. Above the app's sticky chrome (headers ride z-40),
 *  or a tap meant to dismiss lands on the header instead. */
export const PANEL_BACKDROP = {
  position: FIXED,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 99,
} as const;

/** The panel itself, one layer over its backdrop. */
export const PANEL_SHELL = { position: FIXED, zIndex: 100 } as const;

/**
 * Where an anchored panel goes, kept current while it is open: re-placed on
 * resize and on any scroll (capture - the scroll that moves the trigger can
 * happen in any container), coalesced to one measure per frame.
 */
export function useAnchoredPlacement(
  anchor: RefObject<unknown>,
  at: {
    minWidth: number;
    matchWidth?: boolean;
    maxHeight: number;
    align?: 'start' | 'end';
    grow?: boolean;
  },
): AnchorPlacement | null {
  const { minWidth, matchWidth = false, maxHeight, align = 'start', grow = false } = at;
  const [placement, setPlacement] = useState<AnchorPlacement | null>(null);
  // Measured before paint so the panel never flashes at 0,0.
  useLayoutEffect(() => {
    const view = webWindow();
    const trigger = anchor.current as HTMLElement | null;
    if (!view || typeof trigger?.getBoundingClientRect !== 'function') return;
    let frame = 0;
    const settle = () => {
      frame = 0;
      setPlacement(placeUnder(trigger, { minWidth, matchWidth, maxHeight, align, grow }));
    };
    const queue = () => {
      if (frame === 0) frame = view.requestAnimationFrame(settle);
    };
    settle();
    view.addEventListener('resize', queue);
    view.addEventListener('scroll', queue, true);
    return () => {
      if (frame !== 0) view.cancelAnimationFrame(frame);
      view.removeEventListener('resize', queue);
      view.removeEventListener('scroll', queue, true);
    };
  }, [anchor, minWidth, matchWidth, maxHeight, align, grow]);
  return placement;
}

/** Keeps the DOM focus on the trigger for the panel's whole life: the trigger
 *  owns the keyboard and names the active row, so a portalled panel never
 *  fights a <Modal>'s focus trap for it. */
export function useTriggerFocus(anchor: RefObject<unknown>): void {
  useEffect(() => {
    const trigger = anchor.current as HTMLElement | null;
    trigger?.focus?.();
    return () => trigger?.focus?.();
  }, [anchor]);
}

/**
 * Wires the trigger to a panel it does not contain: its keys reach the panel's
 * keyboard, and `aria-controls`/`aria-haspopup` say what it opens. The trigger
 * keeps the DOM focus (see {@link useTriggerFocus}), so it is where the keys
 * arrive.
 */
export function useTriggerKeys(
  anchor: RefObject<unknown>,
  at: { listId: string; haspopup: string; onKeyDown: (event: PanelKeyEvent) => void },
): void {
  const { listId, haspopup, onKeyDown } = at;
  useEffect(() => {
    const trigger = anchor.current as HTMLElement | null;
    if (!trigger) return;
    const onKey = (event: KeyboardEvent) => {
      onKeyDown({
        nativeEvent: { key: event.key },
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      });
    };
    trigger.addEventListener('keydown', onKey);
    trigger.setAttribute('aria-controls', listId);
    trigger.setAttribute('aria-haspopup', haspopup);
    return () => {
      trigger.removeEventListener('keydown', onKey);
      trigger.removeAttribute('aria-controls');
      trigger.removeAttribute('aria-haspopup');
    };
  }, [anchor, listId, haspopup, onKeyDown]);
}

/** Names the active row on the trigger, which is what holds the focus. */
export function useActiveDescendant(anchor: RefObject<unknown>, rowId: string): void {
  useEffect(() => {
    const trigger = anchor.current as HTMLElement | null;
    if (!trigger) return;
    trigger.setAttribute('aria-activedescendant', rowId);
    return () => trigger.removeAttribute('aria-activedescendant');
  }, [anchor, rowId]);
}

export interface ListKeysAt {
  count: number;
  active: number;
  setActive: (index: number) => void;
  disabledAt?: (index: number) => boolean;
  /** Enables type-ahead: printable keys jump to the first label they start. */
  labelAt?: (index: number) => string;
  onPick: (index: number) => void;
  onClose: () => void;
}

export interface PanelKeyEvent {
  nativeEvent: { key: string };
  preventDefault: () => void;
  /** The DOM event's own. A key the panel answers must not also reach the
   *  trigger, whose press responder would reopen what it just closed. */
  stopPropagation?: () => void;
}

/**
 * The roving-highlight keyboard of the aria-activedescendant pattern: arrows
 * move (skipping disabled rows), Home/End jump, Enter/Space pick, printable
 * keys type ahead, Esc/Tab close - with the Escape keyup swallowed so a
 * <Dialog> under the panel does not close with it.
 */
export function useListKeys(at: ListKeysAt): {
  move: (from: number, delta: -1 | 1) => void;
  onKeyDown: (event: PanelKeyEvent) => void;
} {
  const typed = useRef({ buffer: '', last: 0 });
  const live = useRef(at);
  live.current = at;

  const move = useCallback((from: number, delta: -1 | 1) => {
    const { count, disabledAt, setActive } = live.current;
    for (let i = from + delta; i >= 0 && i < count; i += delta) {
      if (!disabledAt?.(i)) {
        setActive(i);
        return;
      }
    }
  }, []);

  const typeahead = useCallback((key: string) => {
    const { count, disabledAt, labelAt, setActive } = live.current;
    if (!labelAt) return;
    const now = Date.now();
    const state = typed.current;
    state.buffer = (now - state.last > 500 ? '' : state.buffer) + key.toLowerCase();
    state.last = now;
    for (let i = 0; i < count; i++) {
      if (!disabledAt?.(i) && labelAt(i).toLowerCase().startsWith(state.buffer)) {
        setActive(i);
        return;
      }
    }
  }, []);

  const onKeyDown = useCallback(
    (event: PanelKeyEvent) => {
      const key = event.nativeEvent.key;
      const { count, active, disabledAt, onPick, onClose } = live.current;
      const claim = () => {
        event.preventDefault();
        event.stopPropagation?.();
      };
      if (key === 'ArrowDown') {
        claim();
        move(active, 1);
      } else if (key === 'ArrowUp') {
        claim();
        move(active, -1);
      } else if (key === 'Home') {
        claim();
        move(-1, 1);
      } else if (key === 'End') {
        claim();
        move(count, -1);
      } else if (key === 'Enter' || key === ' ') {
        claim();
        if (!disabledAt?.(active)) onPick(active);
      } else if (key === 'Escape' || key === 'Tab') {
        claim();
        if (key === 'Escape') armEscapeGuard();
        onClose();
      } else if (key.length === 1) {
        claim();
        typeahead(key);
      }
    },
    [move, typeahead],
  );

  return { move, onKeyDown };
}
