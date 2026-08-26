// Where an anchored panel goes and how its trigger is wired to it: the
// placement that follows the trigger, and who holds the focus for the panel's
// lifetime. The roving highlight is ./anchored-keys.

import { type RefObject, useEffect, useLayoutEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import {
  type AnchorPlacement,
  type AnchorRect,
  type AnchorViewport,
  placeUnder,
} from '#ui/lib/anchor';
import type { PanelKeyEvent } from '#ui/lib/anchored-keys';
import { webWindow } from '#ui/lib/dom';
import { WEB } from '#ui/lib/platform';

// React Native has no `position: fixed` and its absolute is the closest it has;
// the browser targets need `fixed`, since the panel is placed in viewport
// coordinates and has to ride them. The cast is because React Native's types
// stop at `absolute`.
const OVERLAY = (WEB ? 'fixed' : 'absolute') as 'absolute';

/** The click-away layer. Above the app's sticky chrome (headers ride z-40),
 *  or a tap meant to dismiss lands on the header instead. */
export const PANEL_BACKDROP = {
  position: OVERLAY,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 99,
} as const;

export const PANEL_SHELL = { position: OVERLAY, zIndex: 100 } as const;

interface AnchorHandle {
  focus?: () => void;
  getBoundingClientRect?: () => AnchorRect;
  measureInWindow?: (into: (x: number, y: number, width: number, height: number) => void) => void;
}

function webTrigger(anchor: RefObject<unknown>): HTMLElement | null {
  const node = anchor.current as HTMLElement | null;
  return typeof node?.setAttribute === 'function' ? node : null;
}

function viewport(): AnchorViewport | null {
  const win = webWindow();
  if (win) return { width: win.innerWidth, height: win.innerHeight };
  const { width, height } = Dimensions.get('window');
  return width > 0 && height > 0 ? { width, height } : null;
}

// A browser measures synchronously, which is what keeps the panel from painting
// a frame behind the trigger; `measureInWindow` answers on the next tick, and an
// unplaced panel draws nothing until it does.
function measureAnchor(anchor: RefObject<unknown>, into: (rect: AnchorRect) => void): void {
  const handle = anchor.current as AnchorHandle | null;
  if (handle?.getBoundingClientRect) into(handle.getBoundingClientRect());
  else handle?.measureInWindow?.((left, top, width, height) => into({ left, top, width, height }));
}

/**
 * Where an anchored panel goes, kept current while it is open: re-placed when
 * the window changes size, and on any scroll a browser reports (capture - the
 * scroll that moves the trigger can happen in any container), coalesced to one
 * measure per frame.
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
  useLayoutEffect(() => {
    let live = true;
    const settle = () => {
      measureAnchor(anchor, (rect) => {
        if (live) {
          setPlacement(
            placeUnder(rect, viewport(), { minWidth, matchWidth, maxHeight, align, grow }),
          );
        }
      });
    };
    settle();
    const win = webWindow();
    if (!win) {
      const rotation = Dimensions.addEventListener('change', settle);
      return () => {
        live = false;
        rotation.remove();
      };
    }
    let frame = 0;
    const settleOnFrame = () => {
      frame = 0;
      settle();
    };
    const queue = () => {
      if (frame === 0) frame = win.requestAnimationFrame(settleOnFrame);
    };
    win.addEventListener('resize', queue);
    win.addEventListener('scroll', queue, true);
    return () => {
      live = false;
      if (frame !== 0) win.cancelAnimationFrame(frame);
      win.removeEventListener('resize', queue);
      win.removeEventListener('scroll', queue, true);
    };
  }, [anchor, minWidth, matchWidth, maxHeight, align, grow]);
  return placement;
}

/** Keeps the focus on the trigger for the panel's whole life: the trigger owns
 *  the keyboard and names the active row, so a portalled panel never fights a
 *  <Modal>'s focus trap for it. */
export function useTriggerFocus(anchor: RefObject<unknown>): void {
  useEffect(() => {
    const trigger = anchor.current as AnchorHandle | null;
    trigger?.focus?.();
    return () => trigger?.focus?.();
  }, [anchor]);
}

/**
 * Wires the trigger to a panel it does not contain: its keys reach the panel's
 * keyboard, and `aria-controls`/`aria-haspopup` say what it opens. The trigger
 * keeps the focus (see {@link useTriggerFocus}), so it is where the keys arrive.
 *
 * Browser targets only, since that is where a focus can be virtual; elsewhere
 * the platform's own focus engine walks the rows.
 */
export function useTriggerKeys(
  anchor: RefObject<unknown>,
  at: { listId: string; haspopup: string; onKeyDown: (event: PanelKeyEvent) => void },
): void {
  const { listId, haspopup, onKeyDown } = at;
  useEffect(() => {
    const trigger = webTrigger(anchor);
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

/** Names the active row on the trigger, which is what holds the focus. Browser
 *  targets only, for the same reason as {@link useTriggerKeys}. */
export function useActiveDescendant(anchor: RefObject<unknown>, rowId: string): void {
  useEffect(() => {
    const trigger = webTrigger(anchor);
    if (!trigger) return;
    trigger.setAttribute('aria-activedescendant', rowId);
    return () => trigger.removeAttribute('aria-activedescendant');
  }, [anchor, rowId]);
}
