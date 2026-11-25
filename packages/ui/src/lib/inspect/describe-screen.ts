import { mountedAnchors } from './mounted-anchors';
import { committedTree, type Fiber, fiberOfInstance } from './react-fiber';
import { readScreen, type ScreenTree } from './screen-tree';

function committedTrees(): Fiber[] {
  const trees = new Map<object, Fiber>();
  for (const anchor of mountedAnchors) {
    const fiber = fiberOfInstance(anchor);
    const tree = fiber && committedTree(fiber);
    if (tree) {
      trees.set(tree.root, tree.current);
    }
  }
  return [...trees.values()];
}

/** The kit components mounted under every `KitProvider`, as a tree of their
 *  public names (`Dialog.Footer`), props and boxes. */
export function describeScreen(): ScreenTree {
  return readScreen(committedTrees());
}
