// The roving highlight an anchored panel runs on: which row is active, and
// keeping that row in sight.

import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import { armEscapeGuard } from '#ui/lib/escape-guard';

export interface ListKeysAt {
  count: number;
  active: number;
  setActive: (index: number) => void;
  disabledAt?: (index: number) => boolean;
  labelAt?: (index: number) => string;
  onPick: (index: number) => void;
  onClose: () => void;
}

export interface PanelKeyEvent {
  nativeEvent: { key: string };
  preventDefault: () => void;
  stopPropagation?: () => void;
}

/**
 * The roving-highlight keyboard of the aria-activedescendant pattern: arrows
 * move (skipping disabled rows), Home/End jump, Enter/Space pick, printable
 * keys type ahead, Esc/Tab close - with the Escape keyup swallowed so a
 * <Dialog> under the panel does not close with it.
 */
export function useListKeys(at: ListKeysAt): {
  move: (from: number, delta: -1 | 1) => void;
  onKeyDown: (event: PanelKeyEvent) => void;
} {
  const typed = useRef({ buffer: '', last: 0 });
  const live = useRef(at);
  useLayoutEffect(() => {
    live.current = at;
  });

  const move = useCallback((from: number, delta: -1 | 1) => {
    const { count, disabledAt, setActive } = live.current;
    for (let i = from + delta; i >= 0 && i < count; i += delta) {
      if (!disabledAt?.(i)) {
        setActive(i);
        return;
      }
    }
  }, []);

  const typeahead = useCallback((key: string) => {
    const { count, disabledAt, labelAt, setActive } = live.current;
    if (!labelAt) return;
    const now = Date.now();
    const state = typed.current;
    state.buffer = (now - state.last > 500 ? '' : state.buffer) + key.toLowerCase();
    state.last = now;
    for (let i = 0; i < count; i++) {
      if (!disabledAt?.(i) && labelAt(i).toLowerCase().startsWith(state.buffer)) {
        setActive(i);
        return;
      }
    }
  }, []);

  const onKeyDown = useCallback(
    (event: PanelKeyEvent) => {
      const key = event.nativeEvent.key;
      const { count, active, disabledAt, onPick, onClose } = live.current;
      const claim = () => {
        event.preventDefault();
        event.stopPropagation?.();
      };
      if (key === 'ArrowDown') {
        claim();
        move(active, 1);
      } else if (key === 'ArrowUp') {
        claim();
        move(active, -1);
      } else if (key === 'Home') {
        claim();
        move(-1, 1);
      } else if (key === 'End') {
        claim();
        move(count, -1);
      } else if (key === 'Enter' || key === ' ') {
        claim();
        if (!disabledAt?.(active)) onPick(active);
      } else if (key === 'Escape' || key === 'Tab') {
        claim();
        if (key === 'Escape') armEscapeGuard();
        onClose();
      } else if (key.length === 1) {
        claim();
        typeahead(key);
      }
    },
    [move, typeahead],
  );

  return { move, onKeyDown };
}

export interface PanelScroll {
  ref: RefObject<ScrollView | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

interface RowBox {
  y: number;
  height: number;
}

function scrollFor(row: RowBox, offset: number, viewHeight: number): number | null {
  if (row.y < offset) return row.y;
  if (row.y + row.height > offset + viewHeight) return row.y + row.height - viewHeight;
  return null;
}

/**
 * Keeps the active row in sight as the keyboard walks a scrolling panel. Rows
 * report their own box through `onRowLayout`; `scroll` goes on <AnchoredPopup>.
 */
export function useRowInView(active: number): {
  scroll: PanelScroll;
  onRowLayout: (index: number, y: number, height: number) => void;
} {
  const ref = useRef<ScrollView>(null);
  const rows = useRef(new Map<number, RowBox>());
  const offset = useRef(0);
  const viewHeight = useRef(0);

  const onRowLayout = useCallback((index: number, y: number, height: number) => {
    rows.current.set(index, { y, height });
  }, []);

  useEffect(() => {
    const row = rows.current.get(active);
    if (!row || viewHeight.current === 0) return;
    const y = scrollFor(row, offset.current, viewHeight.current);
    if (y === null) return;
    offset.current = y;
    ref.current?.scrollTo({ y, animated: false });
  }, [active]);

  const scroll = useMemo<PanelScroll>(
    () => ({
      ref,
      onLayout: (event) => {
        viewHeight.current = event.nativeEvent.layout.height;
      },
      onScroll: (event) => {
        offset.current = event.nativeEvent.contentOffset.y;
      },
    }),
    [],
  );

  return { scroll, onRowLayout };
}
