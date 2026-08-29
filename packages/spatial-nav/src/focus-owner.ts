import type { FocusTree, TreeNode } from './focus-tree';

function sharedLength(left: readonly string[], right: readonly string[]): number {
  let shared = 0;
  while (shared < left.length && shared < right.length && left[shared] === right[shared]) {
    shared += 1;
  }
  return shared;
}

/** The one node holding the focus, and the branch of containers above it. Every
 *  move blurs before it focuses; a move onto another branch also deactivates the
 *  branch it left and activates the one it entered, down to and including the
 *  node taking the focus. A move between siblings is the focus alone, and losing
 *  the focus entirely deactivates nothing. */
export class FocusOwner {
  private focused: TreeNode | null = null;
  private branch: string[] = [];

  constructor(private readonly tree: FocusTree) {}

  get focusedNode(): TreeNode | null {
    return this.focused;
  }

  move(next: TreeNode | null): void {
    const previous = this.focused;
    if (previous === next) return;
    if (next === null) {
      previous?.config.onBlur?.();
      this.focused = null;
      return;
    }

    const branch = this.branchOf(next);
    const shared = sharedLength(this.branch, branch);
    const switched = shared < this.branch.length || shared < branch.length;

    if (switched) {
      previous?.config.onInactive?.();
      this.notify(this.branch.slice(shared).reverse(), 'onInactive');
    }
    previous?.config.onBlur?.();
    if (switched) {
      this.notify(branch.slice(shared), 'onActive');
      next.config.onActive?.();
    }

    this.focused = next;
    this.branch = branch;
    this.tree.remember(next);
    next.config.onFocus?.();
  }

  private branchOf(node: TreeNode): string[] {
    return this.tree
      .ancestorsOf(node)
      .reverse()
      .map((ancestor) => ancestor.id);
  }

  private notify(ids: readonly string[], event: 'onActive' | 'onInactive'): void {
    for (const id of ids) this.tree.get(id)?.config[event]?.();
  }
}
