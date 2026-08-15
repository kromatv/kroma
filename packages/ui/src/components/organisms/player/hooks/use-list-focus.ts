import type { RemoteKey } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';
import { usePanelHeader } from '#ui/components/organisms/player/lib/panel-header';

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
  /** A control ABOVE the list - the panel's Back button - reached by ▲ from the
   *  first row, and run by OK there. Without it that button is pointer-only and
   *  a remote cannot reach it at all. While it holds the focus, `index` is -1,
   *  which is what the panel renders it lit from.
   *
   *  A list inside a <SettingsPanel> sub-view inherits this from the panel (see
   *  lib/panel-header) and does not pass it. */
  header?: () => void;
}

export interface ListFocus {
  index: number;
  setIndex: (i: number) => void;
  onKey: (key: RemoteKey) => boolean;
  /** Hover handler for row `i` (mouse moves focus, per §15). */
  hover: (i: number) => () => void;
}

function axisDelta(key: RemoteKey, neg: RemoteKey, pos: RemoteKey): -1 | 0 | 1 {
  if (key === neg) return -1;
  if (key === pos) return 1;
  return 0;
}

export function useListFocus(opts: ListFocusOptions): ListFocus {
  const { count, orientation = 'vertical', onActivate, onBack, onExit, onHorizontal } = opts;
  const panelHeader = usePanelHeader();
  const header = opts.header ?? panelHeader?.activate;
  const [index, setIndex] = useState(opts.initial ?? 0);
  const atHeader = index === -1;

  // The panel paints its Back button from this and from nothing else, so the
  // list stays the one place that knows where the focus is.
  const report = panelHeader?.report;
  useEffect(() => {
    if (!report) return;
    report(atHeader);
    return () => report(false);
  }, [report, atHeader]);

  const move = useCallback(
    (dir: -1 | 1): boolean => {
      const next = index + dir;
      // -1 is the header when there is one: ▲ off the first row lands on the
      // Back button rather than leaving the panel.
      if (next < (header ? -1 : 0)) {
        onExit?.('before');
        // Nothing sits above a header, so the key stops here rather than
        // reaching the chrome behind the panel.
        return onExit != null || header != null;
      }
      if (next >= count) {
        onExit?.('after');
        return onExit != null;
      }
      setIndex(next);
      return true;
    },
    [index, count, onExit, header],
  );

  const onKey = useCallback(
    (key: RemoteKey): boolean => {
      const vertical = orientation === 'vertical';
      const along = vertical ? axisDelta(key, 'Up', 'Down') : axisDelta(key, 'Left', 'Right');
      const cross = vertical ? axisDelta(key, 'Left', 'Right') : axisDelta(key, 'Up', 'Down');
      if (along !== 0) return move(along as -1 | 1);
      if (cross !== 0) {
        if (onHorizontal && !atHeader) {
          onHorizontal(index, cross as -1 | 1);
          return true;
        }
        onExit?.(cross === -1 ? 'before' : 'after');
        // Nothing sits beside the header either.
        return onExit != null || atHeader;
      }
      if (key === 'Enter') {
        if (atHeader) {
          header?.();
          return header != null;
        }
        onActivate?.(index);
        return onActivate != null;
      }
      if (key === 'Back') {
        onBack?.();
        return onBack != null;
      }
      return false;
    },
    [orientation, move, index, atHeader, onHorizontal, onExit, onActivate, onBack, header],
  );

  const hover = useCallback((i: number) => () => setIndex(i), []);

  return { index, setIndex, onKey, hover };
}
