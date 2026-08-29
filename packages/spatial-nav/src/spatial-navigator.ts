import { firstFocusable, focusableIn } from './descent';
import { type Direction, moveOf } from './directions';
import { fallbackFocus } from './fallback-focus';
import { FocusOwner } from './focus-owner';
import { FocusTree, type NodeConfig } from './focus-tree';
import { resolveMove } from './resolve-move';

/** The focus tree a D-pad walks. Registration is idempotent, exactly one node
 *  holds the focus, and a lock counts so overlapping surfaces can unlock in any
 *  order. A lock stops {@link handle}, never {@link focus}. */
export class SpatialNavigator {
  private readonly tree = new FocusTree();
  private readonly owner = new FocusOwner(this.tree);
  private locks = 0;

  onEdge?: (direction: Direction) => void;

  /** A node joined the tree. The moment a focus that named an unreachable node
   *  is worth trying again. */
  onRegister?: () => void;

  get focusedId(): string | null {
    return this.owner.focusedNode?.id ?? null;
  }

  get locked(): boolean {
    return this.locks > 0;
  }

  registerNode(id: string, config: NodeConfig): void {
    this.tree.register(id, config);
    this.onRegister?.();
  }

  unregisterNode(id: string): void {
    const node = this.tree.get(id);
    if (node === undefined) return;
    const focused = this.owner.focusedNode;
    if (focused !== null && this.tree.contains(node, focused)) {
      this.owner.move(fallbackFocus(this.tree, node));
    }
    this.tree.remove(node);
  }

  focus(id: string): boolean {
    const node = this.tree.reachable(id);
    if (node === undefined) return false;
    const target = focusableIn(this.tree, node);
    if (target === null) return false;
    this.owner.move(target);
    return true;
  }

  handle(direction: Direction): boolean {
    if (this.locked) return false;
    const move = moveOf(direction);
    if (move === null) return this.select();
    const from = this.owner.focusedNode;
    const target = from === null ? firstFocusable(this.tree) : resolveMove(this.tree, from, move);
    if (target === null) {
      this.onEdge?.(direction);
      return false;
    }
    this.owner.move(target);
    return true;
  }

  lock(): void {
    this.locks += 1;
  }

  unlock(): void {
    this.locks = Math.max(0, this.locks - 1);
  }

  private select(): boolean {
    const focused = this.owner.focusedNode;
    if (focused === null) return false;
    focused.config.onSelect?.();
    return true;
  }
}
