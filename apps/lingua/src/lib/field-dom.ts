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
