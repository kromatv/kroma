// react-native-web's <Modal> closes on the Escape KEYUP (document, bubble
// phase, ignoring defaultPrevented). A popover that closed itself on the
// keyDOWN of that same press must swallow the paired keyup, or the dialog
// underneath closes too. Armed per press; disarms itself.

import { webDocument } from '#ui/lib/dom';

export function armEscapeGuard(): void {
  const doc = webDocument();
  if (!doc) return;
  const swallow = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopImmediatePropagation();
    doc.removeEventListener('keyup', swallow, true);
  };
  doc.addEventListener('keyup', swallow, true);
  // A press abandoned mid-key (the window lost focus) must not eat a later one.
  setTimeout(() => doc.removeEventListener('keyup', swallow, true), 1000);
}
