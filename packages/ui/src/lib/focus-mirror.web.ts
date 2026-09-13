import { holdsCaret } from './dom';
import { pointerDriving } from './input-source';

let mirrored: HTMLElement | null = null;
let keepsScroll: boolean | undefined;

function isElement(view: unknown): view is HTMLElement {
  return typeof HTMLElement !== 'undefined' && view instanceof HTMLElement;
}

function engineKeepsScroll(document: Document): boolean {
  if (keepsScroll === undefined) {
    let asked = false;
    document.createElement('div').focus({
      get preventScroll() {
        asked = true;
        return true;
      },
    });
    keepsScroll = asked;
  }
  return keepsScroll;
}

function focusInPlace(element: HTMLElement): void {
  const document = element.ownerDocument;
  if (engineKeepsScroll(document)) {
    element.focus({ preventScroll: true });
    return;
  }
  const scrollers: [Element, number, number][] = [];
  for (let at = element.parentElement; at; at = at.parentElement) {
    scrollers.push([at, at.scrollTop, at.scrollLeft]);
  }
  const view = document.defaultView;
  const x = view?.scrollX ?? 0;
  const y = view?.scrollY ?? 0;
  element.focus();
  for (const [at, top, left] of scrollers) {
    if (at.scrollTop !== top) at.scrollTop = top;
    if (at.scrollLeft !== left) at.scrollLeft = left;
  }
  if (view && (view.scrollX !== x || view.scrollY !== y)) view.scrollTo(x, y);
}

function letGo(): void {
  const held = mirrored;
  mirrored = null;
  if (held && held.ownerDocument.activeElement === held) held.blur();
}

/**
 * Hands the document's focus to the control the navigator just focused, so a
 * screen reader announces what the ring is on. A move the pointer drove gives
 * the focus back to the page instead, and a field holding the caret keeps it.
 */
export function mirrorFocus(view: unknown): void {
  if (!isElement(view)) return;
  if (pointerDriving()) {
    letGo();
    return;
  }
  const active = view.ownerDocument.activeElement;
  if (holdsCaret(active)) return;
  if (active !== view) {
    if (view.tabIndex < 0) view.setAttribute('tabindex', '-1');
    focusInPlace(view);
  }
  mirrored = view;
}

/** Whether `element` is the control the navigator handed the document's focus to. */
export function isMirrored(element: unknown): boolean {
  return element != null && element === mirrored;
}
