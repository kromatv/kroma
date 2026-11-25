import { useRef } from 'react';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type { ResizableGroupState } from './resizable-context';
import { adjust, FULL, type PanelLimit, resetSeam, resizePanel } from './resizable-layout';

/** The group as it was last drawn, which is what a move measures against. */
export type Frame = {
  readonly layout: readonly number[];
  readonly limits: readonly PanelLimit[];
  readonly available: number;
  readonly opened: readonly number[];
};

type Moves = Pick<ResizableGroupState, 'begin' | 'drag' | 'reset' | 'resize'>;

const NOTHING: readonly number[] = [];

/** What a seam and a panel ask of the group. Each move works out the layout it
 *  wants from the frame last drawn and hands it to `commit`, and none of them
 *  changes identity between renders. */
export function useMoves(
  frame: Frame,
  commit: (next: readonly number[], committed: boolean) => void,
): Moves {
  const from = useRef<readonly number[]>(NOTHING);

  const begin = useStableCallback(() => {
    from.current = frame.layout;
  });

  const drag = useStableCallback((seam: number, delta: number, committed: boolean) => {
    if (frame.available <= 0) {
      return;
    }
    const base = from.current.length === frame.layout.length ? from.current : frame.layout;
    commit(adjust(base, seam, (delta / frame.available) * FULL, frame.limits), committed);
  });

  const reset = useStableCallback((seam: number) => {
    commit(resetSeam(frame.layout, seam, frame.opened, frame.limits), true);
  });

  const resize = useStableCallback((panel: number, size: number) => {
    commit(resizePanel(frame.layout, panel, size, frame.limits), true);
  });

  return { begin, drag, reset, resize };
}
