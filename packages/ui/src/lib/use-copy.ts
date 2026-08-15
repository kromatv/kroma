// Copy to the clipboard, and the confirmation that follows it: the write, the
// tick, and the reason a control has to say when the write was refused.

import { useCallback, useEffect, useRef, useState } from 'react';
import { webWindow } from '#ui/lib/dom';
import { WEB } from '#ui/lib/platform';

// Long enough to be read, short enough that a second copy is not blocked
// behind it.
const CONFIRM_MS = 1200;

/** What a copy control is currently saying. `failed` exists because a refused
 * write is common (see {@link useCopy}) and a control that silently does nothing
 * is the one outcome a reader cannot tell apart from a broken build. */
type CopyState = 'idle' | 'copied' | 'failed';

interface Copier {
  /** False where the platform has no clipboard at all - a television, a phone.
   * A control renders NOTHING there rather than a dead affordance. It starts
   * true on every web target, prerendered or not, so a hydrating page and its
   * markup agree, and is re-read once the document is there. */
  available: boolean;
  /** `copied` or `failed` for a beat after an attempt, then `idle` again. Call
   * sites index their label, glyph and ink off it. */
  state: CopyState;
  copy: (text: string | undefined) => void;
}

function clipboard(): Clipboard | undefined {
  return webWindow()?.navigator?.clipboard;
}

/** The clipboard where the platform has one, a write, and a tick that reverts
 * on its own. */
function useCopy(): Copier {
  const [available, setAvailable] = useState(() => WEB);
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setAvailable(Boolean(clipboard()));
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string | undefined) => {
    const board = clipboard();
    if (!board || !text) return;
    const settle = (next: 'copied' | 'failed') => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), CONFIRM_MS);
    };
    // The rejection is HANDLED, not swallowed. `writeText` rejects with
    // NotAllowedError whenever the document does not have focus - devtools has
    // it, or the page is in a cross-origin frame - which is common enough that
    // an unhandled rejection would be a routine console error AND leave the
    // control looking like the press did nothing at all.
    board.writeText(text).then(
      () => settle('copied'),
      () => settle('failed'),
    );
  }, []);

  return { available, state, copy };
}

export type { CopyState };
export { useCopy };
