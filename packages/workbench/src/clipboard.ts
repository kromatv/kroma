// Copy-to-clipboard, and the confirmation that follows it.
//
// Both copy buttons the workbench has - the code block's and the toolbar's
// share-link - want the same three things: the clipboard if the platform has
// one, a write, and a tick that reverts on its own. They were written twice,
// with the second one's comment citing the first as the rule it follows, which
// is the point at which the rule should just be a function.

import { webWindow } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the tick stays before the icon goes back to its resting glyph. Long
 * enough to be read, short enough that a second copy is not blocked behind it. */
const CONFIRM_MS = 1200;

/** What the button is currently saying. `failed` exists because a refused write
 * is common - see `copy` - and a button that silently does nothing is the one
 * outcome a reader cannot distinguish from a broken build. */
export type CopyState = 'idle' | 'copied' | 'failed';

export interface Copier {
  /** False where the platform has no clipboard - a television. Callers render
   *  NOTHING in that case: a disabled affordance is worse than no affordance. */
  available: boolean;
  /** `copied` / `failed` for `CONFIRM_MS` after an attempt, then back to
   *  `idle`. Call sites index their label, glyph and ink off it. */
  state: CopyState;
  copy: (text: string | undefined) => void;
}

export function useCopy(): Copier {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string | undefined) => {
    const clipboard = webWindow()?.navigator?.clipboard;
    if (!clipboard || !text) return;
    const settle = (next: 'copied' | 'failed') => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), CONFIRM_MS);
    };
    // The rejection is HANDLED, not swallowed. `writeText` rejects with
    // NotAllowedError whenever the document does not have focus - devtools has
    // it, or the page is in a cross-origin frame - which is common enough that
    // an unhandled rejection would be a routine console error AND leave the
    // button looking like the press did nothing at all.
    clipboard.writeText(text).then(
      () => settle('copied'),
      () => settle('failed'),
    );
  }, []);

  return { available: Boolean(webWindow()?.navigator?.clipboard), state, copy };
}
