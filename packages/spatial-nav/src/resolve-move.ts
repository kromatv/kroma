import { alignedIn, firstAmong } from './descent';
import type { Move } from './directions';
import type { FocusTree, TreeNode } from './focus-tree';

/** The node a move lands on from `from`: the nearest sibling holding something
 *  focusable, at the first container up the tree whose orientation answers that
 *  axis. Null when the move runs off the edge. */
export function resolveMove(tree: FocusTree, from: TreeNode, move: Move): TreeNode | null {
  let child = from;
  for (const container of tree.ancestorsOf(from)) {
    if (container.orientation === move.orientation) {
      const target = stepAcross(tree, container, child, move);
      if (target !== null) return target;
    }
    child = container;
  }
  return null;
}

function stepAcross(
  tree: FocusTree,
  container: TreeNode,
  child: TreeNode,
  move: Move,
): TreeNode | null {
  const siblings = tree.siblingsAround(child);
  const ahead = move.forward ? siblings.after : siblings.before;
  const column = container.alignInGrid ? (tree.activeChildOf(child)?.index ?? null) : null;
  if (column === null) return firstAmong(tree, ahead);
  for (const sibling of ahead) {
    const target = alignedIn(tree, sibling, column);
    if (target !== null) return target;
  }
  return null;
}
