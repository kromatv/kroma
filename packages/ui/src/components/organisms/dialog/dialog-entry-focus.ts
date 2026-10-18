// Chrome lets a scroll container take the focus and react-native-web's modal
// trap takes the first node it can focus, so the panel claims the focus itself
// on open and again whenever the trap re-runs: a stop that draws no ring and
// reads as nothing.

import { type RefObject, useEffect } from 'react';
import type { View } from 'react-native';
import { webDocument } from '#ui/lib/dom';

const NATIVE = 'a[href],button,input,select,textarea';
const CONTROL = `${NATIVE},[tabindex]`;

function claimsFocus(node: Element): boolean {
  return node.hasAttribute('tabindex') || node.matches(NATIVE);
}

function firstControl(panel: HTMLElement): HTMLElement | null {
  for (const node of panel.querySelectorAll<HTMLElement>(CONTROL)) {
    const off = node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
    if (!off && node.tabIndex >= 0) return node;
  }
  return null;
}

/**
 * Opens the panel on the first control it holds and keeps the focus there
 * rather than on the panel's own furniture, then hands it back to whatever
 * opened the dialog. A panel that holds no control takes the focus itself,
 * where its title is the accessible name a reader hears; one whose content
 * already claimed the focus is left alone.
 */
export function useDialogEntryFocus(panel: RefObject<View | null>): void {
  useEffect(() => {
    const document = webDocument();
    const box = panel.current as HTMLElement | null;
    if (!document || typeof box?.querySelectorAll !== 'function') return;
    const was = document.activeElement;
    // react-native-web remembers the opener at its own mount, which is after
    // this: whatever it remembers is inside the panel and gone by the time it
    // tries, so the hand-back is the dialog's.
    const opener = box.contains(was) ? null : (was as HTMLElement | null);
    if (opener) {
      const entry = firstControl(box);
      if (entry) entry.focus();
      else {
        box.setAttribute('tabindex', '-1');
        box.focus();
      }
    }
    const sendFocusToControl = (event: FocusEvent) => {
      const at = event.target;
      if (!(at instanceof HTMLElement) || !box.contains(at) || claimsFocus(at)) return;
      firstControl(box)?.focus();
    };
    document.addEventListener('focusin', sendFocusToControl);
    return () => {
      document.removeEventListener('focusin', sendFocusToControl);
      const at = document.activeElement;
      if ((!at || at === document.body) && opener?.isConnected) opener.focus();
    };
  }, [panel]);
}
