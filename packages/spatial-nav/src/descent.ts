import type { FocusTree, TreeNode } from './focus-tree';

/** The focusable node `node` stands for: itself when it is focusable, else the
 *  child it was last left on, else its first focusable descendant. */
export function focusableIn(tree: FocusTree, node: TreeNode): TreeNode | null {
  if (node.focusable) return node;
  const remembered = tree.activeChildOf(node);
  const found = remembered ? focusableIn(tree, remembered) : null;
  if (found !== null) return found;
  return firstAmong(
    tree,
    tree.childrenOf(node.id).filter((child) => child !== remembered),
  );
}

export function firstAmong(tree: FocusTree, nodes: readonly TreeNode[]): TreeNode | null {
  for (const node of nodes) {
    const found = focusableIn(tree, node);
    if (found !== null) return found;
  }
  return null;
}

export function firstFocusable(tree: FocusTree): TreeNode | null {
  return firstAmong(tree, tree.childrenOf(null));
}

/** Enters `node` at the column an aligned grid is walking, falling back to the
 *  nearest lower index and then to whatever the container itself prefers. */
export function alignedIn(tree: FocusTree, node: TreeNode, column: number): TreeNode | null {
  const atOrBefore = tree.childrenOf(node.id).filter((child) => child.index <= column);
  atOrBefore.reverse();
  return firstAmong(tree, atOrBefore) ?? focusableIn(tree, node);
}
