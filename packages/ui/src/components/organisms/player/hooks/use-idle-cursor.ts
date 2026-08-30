import { useEffect } from 'react';
import { webDocument } from '#ui/lib/dom';

/** The player root's element id, which the idle-cursor rule hooks onto. */
export const PLAYER_ROOT_ID = 'kroma-player';

const IDLE_STYLE_ID = 'kroma-player-idle-cursor';

// Every element under the root, with `!important`, rather than one `cursor` on
// the root: the cursor is read off whatever the pointer is over, and the stage
// is a button, so the kit reset's hand beats anything merely inherited down.
const IDLE_RULE = `#${PLAYER_ROOT_ID}, #${PLAYER_ROOT_ID} * { cursor: none !important; }`;

/**
 * Takes the pointer away while the chrome is away, and gives it back with it -
 * what YouTube's `ytp-autohide` does. A no-op on a target with no document.
 */
export function useIdleCursor(hidden: boolean): void {
  useEffect(() => {
    const doc = webDocument();
    if (!hidden || !doc?.head) return;
    const el = doc.createElement('style');
    el.id = IDLE_STYLE_ID;
    el.textContent = IDLE_RULE;
    doc.head.append(el);
    return () => el.remove();
  }, [hidden]);
}
