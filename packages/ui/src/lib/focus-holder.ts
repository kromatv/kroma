/** One host's record of the element that holds the focus. */
export interface FocusHolder {
  hold: (view: unknown) => void;
  drop: (view: unknown) => void;
  view: () => unknown;
}

/** Records which element holds the focus under one host, where the focus is
 *  decided, so that reading it later costs nothing at render. `drop` forgets
 *  the holder only when it is still that element: the next control can take
 *  the focus before the previous one blurs. */
export function createFocusHolder(): FocusHolder {
  let held: unknown = null;
  return {
    hold: (view) => {
      held = view ?? null;
    },
    drop: (view) => {
      if (held === view) {
        held = null;
      }
    },
    view: () => held,
  };
}
