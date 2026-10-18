import { type RefObject, useEffect, useEffectEvent } from 'react';
import type { View } from 'react-native';
import { holdsCaret, webDocument } from '#ui/lib/dom';

const MODAL = '[aria-modal="true"]';

function isElement(node: unknown): node is HTMLElement {
  return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
}

/**
 * While `active`, Escape anywhere on the page clears the selection, unless a
 * caret, a modal or a popup nearer the focus has claimed the key. When the bar
 * leaves with the focus inside it, the focus goes back to the element it came
 * from. Browser targets only; elsewhere the Clear part is the way out.
 */
export function useSelectionKeys(
  active: boolean,
  bar: RefObject<View | null>,
  onClear: () => void,
): void {
  const clear = useEffectEvent(onClear);
  useEffect(() => {
    const document = webDocument();
    if (!document || !active) return;
    const inside = (node: unknown) => {
      const box = bar.current;
      return isElement(box) && node instanceof Node && box.contains(node);
    };
    let origin = inside(document.activeElement) ? null : document.activeElement;
    const track = (event: FocusEvent) => {
      if (!inside(event.target) && isElement(event.target)) origin = event.target;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (holdsCaret(document.activeElement) || document.querySelector(MODAL)) return;
      event.preventDefault();
      clear();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', track);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', track);
      const at = document.activeElement;
      const lost = at === null || at === document.body || inside(at);
      if (lost && isElement(origin) && origin.isConnected) origin.focus();
    };
  }, [active, bar]);
}
