import { firstAmong } from './descent';
import type { FocusTree, TreeNode } from './focus-tree';

/** Where the focus goes when `node`'s subtree leaves the tree: the sibling
 *  before it, else the one after it, else the same search one level up. Call it
 *  while the subtree is still attached; it never returns a node inside it. */
export function fallbackFocus(tree: FocusTree, node: TreeNode): TreeNode | null {
  for (const leaving of [node, ...tree.ancestorsOf(node)]) {
    const siblings = tree.siblingsAround(leaving);
    const found = firstAmong(tree, siblings.before) ?? firstAmong(tree, siblings.after);
    if (found !== null) return found;
  }
  return null;
}
