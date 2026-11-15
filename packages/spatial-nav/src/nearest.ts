import type { Move } from './directions';
import type { FocusTree, Rect, TreeNode } from './focus-tree';

function focusablesIn(tree: FocusTree, node: TreeNode): TreeNode[] {
  if (node.focusable) return [node];
  return tree.childrenOf(node.id).flatMap((child) => focusablesIn(tree, child));
}

function gapAcross(a: Rect, b: Rect, move: Move): number {
  const [aStart, aSize, bStart, bSize] =
    move.orientation === 'vertical' ? [a.x, a.width, b.x, b.width] : [a.y, a.height, b.y, b.height];
  return Math.max(0, aStart - (bStart + bSize), bStart - (aStart + aSize));
}

function centreAcross(rect: Rect, move: Move): number {
  return move.orientation === 'vertical' ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
}

/**
 * The focusable under the first of `ahead` that holds any, nearest on screen to
 * `from` across the move: the one facing it, and among several the one whose
 * centre is closest. Null when `from` or every candidate cannot say where it
 * is, so the caller falls back on the order of the tree.
 */
export function nearestAmong(
  tree: FocusTree,
  ahead: readonly TreeNode[],
  from: TreeNode,
  move: Move,
): TreeNode | null {
  const origin = from.config.rect?.() ?? null;
  if (origin === null) return null;
  for (const sibling of ahead) {
    const candidates = focusablesIn(tree, sibling);
    if (candidates.length === 0) continue;
    let nearest: TreeNode | null = null;
    let best: readonly [number, number] = [Infinity, Infinity];
    for (const candidate of candidates) {
      const rect = candidate.config.rect?.() ?? null;
      if (rect === null) continue;
      const score = [
        gapAcross(origin, rect, move),
        Math.abs(centreAcross(origin, move) - centreAcross(rect, move)),
      ] as const;
      if (score[0] < best[0] || (score[0] === best[0] && score[1] < best[1])) {
        nearest = candidate;
        best = score;
      }
    }
    return nearest;
  }
  return null;
}
