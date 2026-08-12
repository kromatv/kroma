// Body scroll lock for an open overlay: the page behind a dialog or drawer must
// not move. The half for targets with no page at all is ./scroll-lock.
//
// Three things a bare `overflow: hidden` gets wrong, and this does not. Hiding
// the page's scrollbar hands its width back to the layout and everything jumps
// sideways, so the width is MEASURED and returned as padding - it is 0 under
// the overlay scrollbars macOS draws, which is why it cannot be a constant.
// iOS Safari scrolls the document regardless, so a touch no scroller under it
// can answer is cancelled outright. And the panel's own body still scrolls,
// because the walk up from the touch stops at the first element that can move
// the way the finger asked.

import { useEffect } from 'react';
import { webDocument, webWindow } from '#ui/lib/dom';

const NOOP = () => {};

const ELEMENT_NODE = 1;

const PASSIVE = { passive: true } as const;
const ACTIVE = { passive: false } as const;

let holds = 0;
let release = NOOP;

/**
 * Freeze the page behind an overlay while `locked`, and give it back when the
 * overlay closes or unmounts. Reference-counted: the inner of two open
 * overlays releases nothing while the outer still holds the page.
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    if (holds === 0) release = lockPage();
    holds += 1;
    return () => {
      holds -= 1;
      if (holds > 0) return;
      release();
      release = NOOP;
    };
  }, [locked]);
}

function lockPage(): () => void {
  const doc = webDocument();
  const win = webWindow();
  if (!doc || !win) return NOOP;
  const root = doc.documentElement;
  const { body } = doc;
  // Both, because which of the two owns the viewport's scrollbar is the page's
  // decision: the root's overflow wins unless it is `visible`, and a shell that
  // states one of them leaves the other free to keep scrolling.
  const held = { root: root.style.overflow, body: body.style.overflow };
  const padding = body.style.paddingRight;
  const gap = win.innerWidth - root.clientWidth;
  root.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  if (gap > 0) {
    const own = Number.parseFloat(win.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${own + gap}px`;
  }
  const unguard = guardTouch(doc, win);
  return () => {
    unguard();
    root.style.overflow = held.root;
    body.style.overflow = held.body;
    body.style.paddingRight = padding;
  };
}

function guardTouch(doc: Document, win: Window): () => void {
  let from = 0;
  const start = (event: TouchEvent) => {
    from = event.touches[0]?.clientY ?? 0;
  };
  const move = (event: TouchEvent) => {
    // Two fingers are a zoom, which the page is welcome to, and an event
    // already committed to elsewhere cannot be taken back.
    if (event.touches.length > 1 || !event.cancelable) return;
    const asked = from - (event.touches[0]?.clientY ?? 0);
    if (!scrollerUnder(event.target, asked, win)) event.preventDefault();
  };
  doc.addEventListener('touchstart', start, PASSIVE);
  doc.addEventListener('touchmove', move, ACTIVE);
  return () => {
    doc.removeEventListener('touchstart', start);
    doc.removeEventListener('touchmove', move);
  };
}

// `asked` is how far the CONTENT was told to travel: positive is downwards.
function scrollerUnder(target: EventTarget | null, asked: number, win: Window): boolean {
  let node = asElement(target);
  while (node) {
    if (canScroll(node, asked, win)) return true;
    node = node.parentElement;
  }
  return false;
}

// By node type rather than `instanceof Element`: the constructor to compare
// against belongs to the document the event came from, and a touch that landed
// on the document itself is not an element at all.
function asElement(target: EventTarget | null): Element | null {
  const node = target as Node | null;
  return node?.nodeType === ELEMENT_NODE ? (node as Element) : null;
}

function canScroll(node: Element, asked: number, win: Window): boolean {
  const room = node.scrollHeight - node.clientHeight;
  if (room <= 0) return false;
  const overflow = win.getComputedStyle(node).overflowY;
  if (overflow !== 'auto' && overflow !== 'scroll') return false;
  return asked > 0 ? node.scrollTop < room : node.scrollTop > 0;
}
