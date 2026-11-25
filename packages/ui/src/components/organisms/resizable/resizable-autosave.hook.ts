import { useEffect, useRef } from 'react';
import { type ResizableStorage, readLayout, writeLayout } from './resizable-store';

/** Where a group keeps its layout, and the layout to keep. `restore` is handed
 *  what was kept for a new arrangement, or null when nothing was, with the
 *  reason `restore`. */
export type AutoSave = {
  readonly store: ResizableStorage | null;
  readonly autoSaveId: string | undefined;
  readonly arrangement: string;
  readonly mine: readonly number[] | null;
  readonly restore: (saved: readonly number[] | null, why: 'restore') => void;
};

/** Writes the group's own layout under its arrangement, and reads the one kept
 *  for the next arrangement when a window crossing a breakpoint hands the group
 *  a different set of panels. */
export function useAutoSave({ store, autoSaveId, arrangement, mine, restore }: AutoSave): void {
  const arranged = useRef(arrangement);
  useEffect(() => {
    if (arranged.current === arrangement) {
      return;
    }
    arranged.current = arrangement;
    restore(readLayout(store, autoSaveId, arrangement), 'restore');
  }, [arrangement, store, autoSaveId, restore]);

  useEffect(() => {
    if (mine) {
      writeLayout(store, autoSaveId, arrangement, mine);
    }
  }, [store, autoSaveId, arrangement, mine]);
}
