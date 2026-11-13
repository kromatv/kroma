import { alignedIn, firstAmong } from './descent';
import type { Move } from './directions';
import type { FocusTree, TreeNode } from './focus-tree';
import { nearestAmong } from './nearest';

/** The node a move lands on from `from`: the nearest sibling holding something
 *  focusable, at the first container up the tree whose orientation answers that
 *  axis. Inside that sibling it is the child last left on, the child of the
 *  same column in a grid, or, under a `spatial` container, the focusable
 *  nearest on screen. Null when the move runs off the edge. */
export function resolveMove(tree: FocusTree, from: TreeNode, move: Move): TreeNode | null {
  let child = from;
  for (const container of tree.ancestorsOf(from)) {
    if (container.orientation === move.orientation) {
      const target = stepAcross(tree, container, child, from, move);
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
  from: TreeNode,
  move: Move,
): TreeNode | null {
  const siblings = tree.siblingsAround(child);
  const ahead = move.forward ? siblings.after : siblings.before;
  const column = container.alignInGrid ? (tree.activeChildOf(child)?.index ?? null) : null;
  if (column === null) {
    const nearest = container.config.spatial ? nearestAmong(tree, ahead, from, move) : null;
    return nearest ?? firstAmong(tree, ahead);
  }
  for (const sibling of ahead) {
    const target = alignedIn(tree, sibling, column);
    if (target !== null) return target;
  }
  return null;
}
