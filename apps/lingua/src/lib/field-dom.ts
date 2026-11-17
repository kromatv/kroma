import type { Selection } from '#site/lib/placeables';

const MESSAGE = 'data-message';

/** The text field of message `key`, inside the block the editor marks with its key. */
export function fieldOf(key: string, root: ParentNode = document): HTMLTextAreaElement | null {
  const block = [...root.querySelectorAll(`[${MESSAGE}]`)].find(
    (element) => element.getAttribute(MESSAGE) === key,
  );
  return block?.querySelector('textarea') ?? null;
}

/** The key of the message a field belongs to, or null for a field that is not a message's. */
export function keyOfField(field: Element): string | null {
  return field.closest(`[${MESSAGE}]`)?.getAttribute(MESSAGE) ?? null;
}

/** Every message field under `root`, in the order they are on the page. */
export function messageFields(root: ParentNode = document): HTMLTextAreaElement[] {
  return [...root.querySelectorAll<HTMLTextAreaElement>(`[${MESSAGE}] textarea`)];
}

/** What is selected in `field`, or where its caret is. */
export function selectionOf(field: HTMLTextAreaElement): Selection {
  return { start: field.selectionStart, end: field.selectionEnd };
}

/** Focus `field` with its caret at `caret`, or where it was, and bring it to the middle of the window. */
export function focusField(field: HTMLTextAreaElement, caret?: number): void {
  field.focus({ preventScroll: true });
  if (caret !== undefined) {
    field.setSelectionRange(caret, caret);
  }
  field.scrollIntoView?.({ block: 'center' });
}

/** Where a field's text sits inside the box that holds it, and the type it is set in, for a layer drawn over it. */
export interface FieldBox {
  top: number;
  left: number;
  width: number;
  height: number;
  scrollTop: number;
  padding: { top: number; right: number; bottom: number; left: number };
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  letterSpacing: number;
}

const px = (value: string) => Number.parseFloat(value) || 0;

/** Measure `field` as it is drawn inside `host`: its inner box, its scroll, its padding and its type. */
export function measureField(field: HTMLTextAreaElement, host: Element): FieldBox {
  const style = getComputedStyle(field);
  const at = field.getBoundingClientRect();
  const origin = host.getBoundingClientRect();
  return {
    top: at.top - origin.top + field.clientTop,
    left: at.left - origin.left + field.clientLeft,
    width: field.clientWidth,
    height: field.clientHeight,
    scrollTop: field.scrollTop,
    padding: {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    },
    fontFamily: style.fontFamily,
    fontSize: px(style.fontSize),
    fontWeight: style.fontWeight,
    lineHeight: px(style.lineHeight) || px(style.fontSize) * 1.2,
    letterSpacing: px(style.letterSpacing),
  };
}
