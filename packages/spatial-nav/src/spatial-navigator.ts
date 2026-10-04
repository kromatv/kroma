import { firstFocusable, focusableIn } from './descent';
import { type Direction, moveOf } from './directions';
import { fallbackFocus } from './fallback-focus';
import { FocusOwner } from './focus-owner';
import { FocusTree, type NodeConfig } from './focus-tree';
import { resolveMove } from './resolve-move';

/** How long OK, or a pointer, stays down before a press is a hold. */
export const HOLD_MS = 500;

interface Press {
  readonly id: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/** The focus tree a D-pad walks. Registration is idempotent, exactly one node
 *  holds the focus, and a lock counts so overlapping surfaces can unlock in any
 *  order. A lock stops {@link handle}, never {@link focus}.
 *
 *  OK on a node that {@link NodeConfig.holds} selects on `release` instead of
 *  on `enter`, and turns into a long select once it has been down for half a
 *  second or the platform reports `hold`. */
export class SpatialNavigator {
  private readonly tree = new FocusTree();
  private readonly owner = new FocusOwner(this.tree);
  private locks = 0;
  private press: Press | null = null;

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
    if (direction === 'release') return this.release();
    if (this.locked) return false;
    if (direction === 'hold') return this.longSelect();
    const move = moveOf(direction);
    if (move === null) return this.select();
    this.drop();
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
    if (focused.config.holds?.() !== true) {
      focused.config.onSelect?.();
      return true;
    }
    this.press ??= { id: focused.id, timer: setTimeout(() => this.longSelect(), HOLD_MS) };
    return true;
  }

  private release(): boolean {
    const press = this.press;
    if (press === null) return false;
    this.drop();
    if (this.locked) return false;
    if (press.timer === null) return true;
    const focused = this.owner.focusedNode;
    if (focused?.id === press.id) focused.config.onSelect?.();
    return true;
  }

  private longSelect(): boolean {
    const press = this.press;
    if (press?.timer) clearTimeout(press.timer);
    const focused = this.owner.focusedNode;
    if (press) this.press = { id: press.id, timer: null };
    if (this.locked || focused === null || (press && focused.id !== press.id)) return false;
    if (focused.config.holds?.() === true) focused.config.onLongSelect?.();
    else focused.config.onSelect?.();
    return true;
  }

  private drop(): void {
    if (this.press?.timer) clearTimeout(this.press.timer);
    this.press = null;
  }
}
