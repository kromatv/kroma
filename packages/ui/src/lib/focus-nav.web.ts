// The browser targets' half of the remote (Tizen / webOS / desktop).
//
// Directional movement is NOT here any more: the spatial navigator owns it, on
// every target at once, so a browser TV and an Apple TV now move focus by the
// same rules instead of by two engines that drifted apart (see lib/focus-remote
// and lib/focus-scope). What is left is the part the navigator has no opinion
// about - Back, the transport keys, and swallowing a held OK's auto-repeats so
// one long press cannot fire a control dozens of times.

import { dispatchRemoteKey, registerTvMediaKeys } from '@kroma/core';
import { useEffect } from 'react';
import { resetFocusEntry } from './focus-entry';
import type { FocusNavHandlers } from './focus-types';
import { armPressGuard } from './press-guard';

function inTextField(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
}

export function useFocusNav({ onBack, onPlayPause, resetKey }: FocusNavHandlers): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is an intentional re-run trigger (a view switch re-focuses the first element); it is not read inside the effect.
  useEffect(() => {
    registerTvMediaKeys();
    // Arm the guard before the listener attaches, so the press that navigated
    // here cannot beat it and activate the control we auto-focus below.
    armPressGuard();
    // A new screen gets to decide where focus opens again: see lib/focus-entry.
    resetFocusEntry();

    const onKey = (e: KeyboardEvent) => {
      // When a text field is focused, let it own the horizontal keys (cursor)
      // and Backspace (edit); only the vertical keys leave the field. Otherwise
      // typing a server URL is impossible.
      const inText = inTextField();
      // Media keys keep their native default (no preventDefault): handlers that
      // return `false` are treated as "not handled" by dispatchRemoteKey.
      const media = () => {
        onPlayPause?.();
        return false as const;
      };
      dispatchRemoteKey(
        e,
        {
          Back: (ev) => {
            // Already consumed by the on-screen keyboard's typing bridge (which
            // preventDefaults the Backspace it turned into a delete). Both
            // listeners sit on window, so without this one press would delete a
            // character AND leave the screen.
            if (ev.defaultPrevented) return false;
            // In a real text field a physical Backspace edits the value (native);
            // only Escape / a remote Back button leaves the screen.
            if (inText && ev.key === 'Backspace') return false;
            return onBack?.();
          },
          Play: media,
          Pause: media,
          PlayPause: media,
          // Directions and OK belong to the navigator, which listens on the same
          // document. Declared as "not handled" so the field below keeps its
          // cursor keys and nothing is preventDefaulted out from under it.
          Up: () => false as const,
          Down: () => false as const,
          Left: () => false as const,
          Right: () => false as const,
          Enter: () => false as const,
        },
        // A held OK auto-repeats; `ignoreRepeat` preventDefaults those, which
        // stops the browser from re-activating the button on every repeat.
        { ignoreRepeat: ['Enter'] },
      );
    };

    window.addEventListener('keydown', onKey);

    // No hover-focus: the amber ring moves on D-pad / arrow keys only (a mouse
    // still clicks natively, and clicking focuses the control). Cursor-follow
    // focus fights physical typing and makes the ring jitter across the
    // on-screen keyboard.
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onBack, onPlayPause, resetKey]);
}
