import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ViewStyle } from 'react-native';
import {
  adjust,
  FULL,
  limitsFor,
  type PanelLimit,
  type PanelSpec,
  sameLayout,
  solve,
} from '#ui/components/organisms/resizable/resizable-layout';
import {
  browserStorage,
  type ResizableStorage,
  readLayout,
  writeLayout,
} from '#ui/components/organisms/resizable/resizable-store';
import { space } from '#ui/core/tokens';
import { drawn, type TableColumn } from './table-columns';

const FLOOR = space[14];

interface ColumnResize {
  seamAfter: (at: number) => boolean;
  share: (at: number) => number;
  measure: (at: number, width: number) => void;
  begin: () => void;
  drag: (at: number, delta: number, committed: boolean) => void;
  reset: () => void;
}

interface ResizeOptions {
  columns: readonly TableColumn[];
  step: number;
  resizable: boolean;
  autoSaveId: string | undefined;
  storage: ResizableStorage | null | undefined;
}

interface DragStart {
  base: readonly number[];
  limits: readonly PanelLimit[];
  room: number;
}

interface Kept {
  arrangement: string;
  sizes: readonly number[] | null;
}

const ResizeContext = createContext<ColumnResize | null>(null);

function useColumnResize(): ColumnResize | null {
  return useContext(ResizeContext);
}

const NONE: readonly number[] = [];

function floorOf(column: TableColumn | undefined): number {
  return column?.min ?? Math.min(column?.width ?? FLOOR, FLOOR);
}

function shareBox(size: number, column: TableColumn | undefined): ViewStyle {
  return { flexGrow: 0, flexShrink: 1, flexBasis: `${size}%`, minWidth: column?.min ?? 0 };
}

function sameShares(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((share, at) => share === b[at]);
}

function useColumnLayout({ columns, step, resizable, autoSaveId, storage }: ResizeOptions): {
  boxes: readonly ViewStyle[] | null;
  resize: ColumnResize | null;
} {
  const shown = useMemo(
    () => columns.flatMap((column, at) => (drawn(column, step) ? [at] : [])),
    [columns, step],
  );
  const arrangement = shown.join(',');
  const specs = useMemo<PanelSpec[]>(
    () => shown.map((at) => ({ minSize: `${floorOf(columns[at])}px` })),
    [shown, columns],
  );
  const store = useMemo(() => (storage === undefined ? browserStorage() : storage), [storage]);

  const restored = useMemo(() => {
    if (!resizable) return null;
    const saved = readLayout(store, autoSaveId, arrangement);
    return saved?.length === shown.length ? saved : null;
  }, [resizable, store, autoSaveId, arrangement, shown.length]);
  const [kept, setKept] = useState<Kept | null>(null);
  const sizes = kept?.arrangement === arrangement ? kept.sizes : restored;

  const widths = useRef<number[]>([]);
  const [measured, setMeasured] = useState(NONE);
  const start = useRef<DragStart | null>(null);

  const resized = sizes !== null;
  const measure = useCallback(
    (at: number, width: number) => {
      widths.current[at] = width;
      if (resized) return;
      const room = shown.reduce((sum, column) => sum + (widths.current[column] ?? 0), 0);
      if (room <= 0) return;
      const next = shown.map((column) => Math.round(((widths.current[column] ?? 0) / room) * FULL));
      setMeasured((was) => (sameShares(was, next) ? was : next));
    },
    [shown, resized],
  );

  const begin = useCallback(() => {
    const now = shown.map((column) => widths.current[column] ?? 0);
    const room = now.reduce((sum, width) => sum + width, 0);
    if (room <= 0) {
      start.current = null;
      return;
    }
    const limits = limitsFor(specs, room);
    const base = sizes ?? now.map((width) => (width / room) * FULL);
    start.current = { base: solve(base, limits), limits, room };
  }, [shown, specs, sizes]);

  const drag = useCallback(
    (at: number, delta: number, committed: boolean) => {
      const from = start.current;
      const seam = shown.indexOf(at);
      if (!from || seam < 0) return;
      const next = adjust(from.base, seam, (delta / from.room) * FULL, from.limits);
      if (!sizes || !sameLayout(next, sizes)) setKept({ arrangement, sizes: next });
      if (committed) writeLayout(store, autoSaveId, arrangement, next);
    },
    [shown, sizes, arrangement, store, autoSaveId],
  );

  const reset = useCallback(() => {
    setKept({ arrangement, sizes: null });
    writeLayout(store, autoSaveId, arrangement, NONE);
  }, [arrangement, store, autoSaveId]);

  const resize = useMemo<ColumnResize | null>(() => {
    if (!resizable) return null;
    const shares = sizes ?? measured;
    return {
      seamAfter: (at) => {
        const seam = shown.indexOf(at);
        return seam >= 0 && seam < shown.length - 1;
      },
      share: (at) => Math.round(shares[shown.indexOf(at)] ?? 0),
      measure,
      begin,
      drag,
      reset,
    };
  }, [resizable, sizes, measured, shown, measure, begin, drag, reset]);

  const boxes = useMemo(() => {
    if (!sizes) return null;
    return columns.map((column, at) => shareBox(sizes[shown.indexOf(at)] ?? 0, column));
  }, [sizes, columns, shown]);

  return { boxes, resize };
}

export type { ColumnResize };
export { ResizeContext, useColumnLayout, useColumnResize };
