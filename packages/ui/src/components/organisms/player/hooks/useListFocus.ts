import type { RemoteKey } from '@kroma/core';
import { useCallback, useState } from 'react';

/**
 * Reusable 1-D focus for a list of controls, driving BOTH the D-pad and the
 * mouse from one index. Every selection panel (Quality, Audio, Speed, Subtitles)
 * and every "value row" surface (subtitle appearance, the AI-gen wizard) uses
 * it, so the focus-ring behaviour is identical everywhere.
 *
 * - vertical   : ▲▼ move the row, ◀▶ call `onHorizontal` (value rows) or `onExit`.
 * - horizontal : ◀▶ move, ▲▼ call `onExit`.
 * `onKey` returns whether the key was consumed.
 */
export interface ListFocusOptions {
  count: number;
  orientation?: 'vertical' | 'horizontal';
  initial?: number;
  /** OK/Enter on the focused index. */
  onActivate?: (index: number) => void;
  /** Back / Escape (dismiss the surface). */
  onBack?: () => void;
  /** Moving off an edge: `before` = ▲/◀ past the first, `after` = ▼/▶ past the last. */
  onExit?: (edge: 'before' | 'after') => void;
  /** Cross-axis nudge (▲▼ list → ◀▶ adjusts the focused row's value). */
  onHorizontal?: (index: number, dir: -1 | 1) => void;
}

export interface ListFocus {
  index: number;
  setIndex: (i: number) => void;
  onKey: (key: RemoteKey) => boolean;
  /** Hover handler for row `i` (mouse moves focus, per §15). */
  hover: (i: number) => () => void;
}

/** -1 / +1 for the two keys that move along an axis, 0 for anything else. */
function axisDelta(key: RemoteKey, neg: RemoteKey, pos: RemoteKey): -1 | 0 | 1 {
  if (key === neg) return -1;
  if (key === pos) return 1;
  return 0;
}

export function useListFocus(opts: ListFocusOptions): ListFocus {
  const { count, orientation = 'vertical', onActivate, onBack, onExit, onHorizontal } = opts;
  const [index, setIndex] = useState(opts.initial ?? 0);

  const move = useCallback(
    (dir: -1 | 1): boolean => {
      const next = index + dir;
      if (next < 0) {
        onExit?.('before');
        return onExit != null;
      }
      if (next >= count) {
        onExit?.('after');
        return onExit != null;
      }
      setIndex(next);
      return true;
    },
    [index, count, onExit],
  );

  const onKey = useCallback(
    (key: RemoteKey): boolean => {
      const vertical = orientation === 'vertical';
      const along = vertical ? axisDelta(key, 'Up', 'Down') : axisDelta(key, 'Left', 'Right');
      const cross = vertical ? axisDelta(key, 'Left', 'Right') : axisDelta(key, 'Up', 'Down');
      if (along !== 0) return move(along as -1 | 1);
      if (cross !== 0) {
        if (onHorizontal) {
          onHorizontal(index, cross as -1 | 1);
          return true;
        }
        onExit?.(cross === -1 ? 'before' : 'after');
        return onExit != null;
      }
      if (key === 'Enter') {
        onActivate?.(index);
        return onActivate != null;
      }
      if (key === 'Back') {
        onBack?.();
        return onBack != null;
      }
      return false;
    },
    [orientation, move, index, onHorizontal, onExit, onActivate, onBack],
  );

  const hover = useCallback((i: number) => () => setIndex(i), []);

  return { index, setIndex, onKey, hover };
}
