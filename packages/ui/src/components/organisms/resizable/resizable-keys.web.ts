// A held seam, on the browser targets: the four directions arrive as key events
// on the document, and the spatial navigator reads them there too (see
// lib/focus-remote.web). It listens on the bubble phase, so taking the keys
// means listening on the CAPTURE phase and stopping them there - the navigator
// then never sees the press that moved a seam.

import { useEffect, useRef } from 'react';
import { webDocument } from '#ui/lib/dom';
import type { GroupOrientation } from '#ui/lib/group-shape';
import type { ResizableKeysOptions } from './resizable-keys-types';

// Tizen and webOS name the four directions without the `Arrow` prefix.
const MOVES: Record<string, { orientation: GroupOrientation; towards: -1 | 1 }> = {
  ArrowLeft: { orientation: 'horizontal', towards: -1 },
  ArrowRight: { orientation: 'horizontal', towards: 1 },
  ArrowUp: { orientation: 'vertical', towards: -1 },
  ArrowDown: { orientation: 'vertical', towards: 1 },
  Left: { orientation: 'horizontal', towards: -1 },
  Right: { orientation: 'horizontal', towards: 1 },
  Up: { orientation: 'vertical', towards: -1 },
  Down: { orientation: 'vertical', towards: 1 },
};

const RELEASES = new Set(['Enter', 'Escape', ' ', 'Backspace']);

function useResizableKeys({ held, orientation, onNudge, onRelease }: ResizableKeysOptions): void {
  const at = useRef({ orientation, onNudge, onRelease });
  at.current = { orientation, onNudge, onRelease };

  useEffect(() => {
    const document = webDocument();
    if (!held || !document) return;
    const onKey = (event: KeyboardEvent) => {
      const move = MOVES[event.key];
      if (!move && !RELEASES.has(event.key)) return;
      event.preventDefault();
      // Every direction is swallowed while the seam is held, not only the two
      // it acts on: focus moving out from under a held seam would leave it
      // holding the keys of a group nobody is looking at.
      event.stopPropagation();
      if (!move) at.current.onRelease();
      else if (move.orientation === at.current.orientation) at.current.onNudge(move.towards);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [held]);
}

export { useResizableKeys };
