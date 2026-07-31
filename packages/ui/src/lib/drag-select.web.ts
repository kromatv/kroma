import { webWindow } from './dom';

/**
 * Stops the browser selecting text and images while a drag is in flight, and
 * returns the undo.
 *
 * It has to go on the DOCUMENT, not the dragged element: a pointer held down on
 * a scrub bar and moved leaves that element immediately, and the selection it
 * then paints belongs to whatever it crosses. Any range already caught by the
 * press that started the drag is cleared too.
 *
 * `webkitUserSelect` as well as `userSelect`: the legacy TV tier is Chromium 53,
 * which only knows the prefixed form.
 */
export function suppressSelection(): () => void {
  const win = webWindow();
  const root = win?.document?.documentElement as HTMLElement | undefined;
  if (!win || !root) return NOOP;

  const style = root.style as CSSStyleDeclaration & { webkitUserSelect?: string };
  const previous = style.userSelect;
  const previousWebkit = style.webkitUserSelect;
  style.userSelect = 'none';
  style.webkitUserSelect = 'none';
  win.getSelection?.()?.removeAllRanges();

  return () => {
    style.userSelect = previous;
    style.webkitUserSelect = previousWebkit;
  };
}

const NOOP = () => {};
