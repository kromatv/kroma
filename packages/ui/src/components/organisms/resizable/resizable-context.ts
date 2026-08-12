// What a resizable group publishes to its panels and its seams.
//
// Yoga has no `:first-child` and there is no DOM to walk, so a part's place in
// the group is handed to it explicitly, one provider per child: a panel is told
// its index and a handle the seam it sits on. See DESIGN.md §2.

import { createContext, useContext } from 'react';
import type { GroupOrientation } from '#ui/lib/group-shape';
import { partContext } from '#ui/lib/part-context';
import type { PanelLimit, PanelSpec } from './resizable-layout';

/** Why a layout changed, handed to `onLayoutChange` beside the layout itself. */
interface ResizableLayoutDetails {
  /** False while a drag is still in flight: the same gesture reports many
   *  times and then once more with `true`. */
  committed: boolean;
  /** False when the group re-clamped itself to a window rather than a reader
   *  moving anything. */
  user: boolean;
}

interface ResizableGroupState {
  orientation: GroupOrientation;
  disabled: boolean;
  /** Points the panels share, the seams' own thickness already taken off. */
  available: number;
  layout: readonly number[];
  limits: readonly PanelLimit[];
  specs: readonly PanelSpec[];
  /** Remembers the layout a gesture starts from, so a drag that runs past a
   *  bound and comes back does not follow the pointer home. */
  begin: () => void;
  /** Moves the seam after panel `at` by `delta` POINTS, measured from the
   *  layout the last `begin` remembered. */
  drag: (at: number, delta: number, committed: boolean) => void;
  /** Puts the two panels a seam separates back in the proportion their own
   *  `defaultSize`s asked for. */
  reset: (at: number) => void;
  /** Asks for a panel to be a given share of the group, the seam beside it
   *  doing the work a drag would have done. */
  resize: (at: number, size: number) => void;
}

const [ResizableGroupContext, useResizableGroup] =
  partContext<ResizableGroupState>('Resizable.Root');
const PanelIndexContext = createContext<number | null>(null);
const SeamIndexContext = createContext<number | null>(null);

function usePanelIndex(): number {
  const at = useContext(PanelIndexContext);
  if (at === null) throw new Error('<Resizable.Panel> must be a direct child of <Resizable.Root>');
  return at;
}

function useSeamIndex(): number {
  const at = useContext(SeamIndexContext);
  if (at === null) throw new Error('<Resizable.Handle> must be a direct child of <Resizable.Root>');
  return at;
}

export type { ResizableGroupState, ResizableLayoutDetails };
export {
  PanelIndexContext,
  ResizableGroupContext,
  SeamIndexContext,
  usePanelIndex,
  useResizableGroup,
  useSeamIndex,
};
