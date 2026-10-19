const MOVING = 'data-kroma-moving';

/** Marks the document as moving from each key press until `settleMs` after the
 *  last one. The kit's art fades are cut while it is set, so art a held D-pad
 *  brings in shows at once; art that lands once the remote is still fades. */
export function cutFadesWhileMoving(win: Window, settleMs = 400): () => void {
  const root = win.document.documentElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => root.removeAttribute(MOVING);
  const move = () => {
    if (!root.hasAttribute(MOVING)) root.setAttribute(MOVING, '');
    clearTimeout(timer);
    timer = setTimeout(settle, settleMs);
  };
  win.addEventListener('keydown', move, { capture: true });
  return () => {
    win.removeEventListener('keydown', move, { capture: true });
    clearTimeout(timer);
    settle();
  };
}
