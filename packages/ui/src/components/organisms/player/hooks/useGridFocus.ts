import type { RemoteKey } from '@kroma/core';
import { useCallback, useState } from 'react';

export interface GridFocusOptions {
  count: number;
  cols: number;
  initial?: number;
  onActivate?: (index: number) => void;
  onBack?: () => void;
  onExit?: (edge: 'top' | 'bottom') => void;
}

export interface GridFocus {
  index: number;
  setIndex: (i: number) => void;
  onKey: (key: RemoteKey) => boolean;
  hover: (i: number) => () => void;
  /** Bumps on every D-pad move but not on hover: scrolling the focused card into
   *  view on hover would shift the layout under the cursor. */
  keyNonce: number;
}

function emptyGridKey(
  key: RemoteKey,
  onExit?: (edge: 'top' | 'bottom') => void,
  onBack?: () => void,
): boolean {
  if (key === 'Up') {
    onExit?.('top');
    return onExit != null;
  }
  if (key === 'Back') {
    onBack?.();
    return onBack != null;
  }
  return false;
}

export function useGridFocus(opts: GridFocusOptions): GridFocus {
  const { count, cols, onActivate, onBack, onExit } = opts;
  const [index, setIndex] = useState(opts.initial ?? 0);
  const [keyNonce, setKeyNonce] = useState(0);

  const move = useCallback((i: number) => {
    setIndex(i);
    setKeyNonce((n) => n + 1);
  }, []);

  const onKey = useCallback(
    (key: RemoteKey): boolean => {
      if (count === 0) return emptyGridKey(key, onExit, onBack);
      const col = index % cols;
      switch (key) {
        case 'Left':
          if (col === 0) return true;
          move(index - 1);
          return true;
        case 'Right':
          if (col === cols - 1 || index + 1 >= count) return true;
          move(index + 1);
          return true;
        case 'Up':
          if (index - cols < 0) {
            onExit?.('top');
            return onExit != null;
          }
          move(index - cols);
          return true;
        case 'Down': {
          const next = index + cols;
          if (next >= count) {
            onExit?.('bottom');
            return onExit != null;
          }
          move(next);
          return true;
        }
        case 'Enter':
          onActivate?.(index);
          return onActivate != null;
        case 'Back':
          onBack?.();
          return onBack != null;
        default:
          return false;
      }
    },
    [index, count, cols, move, onActivate, onBack, onExit],
  );

  const hover = useCallback((i: number) => () => setIndex(i), []);

  return { index, setIndex, onKey, hover, keyNonce };
}
