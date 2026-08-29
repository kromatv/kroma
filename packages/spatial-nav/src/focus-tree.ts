import type { Orientation } from './directions';

/** What a node declares when it registers. `index` is its slot among its
 *  siblings: omitted, the node lands after the highest index its parent has
 *  handed out, and a tie is broken by registration order. */
export interface NodeConfig {
  parent?: string;
  index?: number;
  focusable?: boolean;
  orientation?: Orientation;
  alignInGrid?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onActive?: () => void;
  onInactive?: () => void;
  onSelect?: () => void;
}

export interface TreeNode {
  readonly id: string;
  readonly parent: string | null;
  readonly index: number;
  readonly seq: number;
  readonly focusable: boolean;
  readonly orientation: Orientation | null;
  readonly alignInGrid: boolean;
  readonly config: NodeConfig;
  activeChild: string | null;
}

export interface Siblings {
  readonly before: readonly TreeNode[];
  readonly after: readonly TreeNode[];
}

const NO_CHILDREN: readonly TreeNode[] = [];

function sortsAfter(sibling: TreeNode, node: TreeNode): boolean {
  if (sibling.index !== node.index) return sibling.index > node.index;
  return sibling.seq > node.seq;
}

/** The tree the navigator walks: who is whose child, in what order, and which
 *  child each container was last left on. Registering an id it already holds,
 *  or dropping one it does not, is a no-op, and a node whose parent has not
 *  registered yet is held until it does. */
export class FocusTree {
  private readonly nodes = new Map<string, TreeNode>();
  private readonly children = new Map<string | null, TreeNode[]>();
  private readonly waiting = new Map<string, TreeNode[]>();
  private readonly slots = new Map<string | null, number>();
  private sequence = 0;

  get(id: string): TreeNode | undefined {
    return this.nodes.get(id);
  }

  childrenOf(parent: string | null): readonly TreeNode[] {
    return this.children.get(parent) ?? NO_CHILDREN;
  }

  /** The node `id` names, but only once every parent between it and a root has
   *  registered. */
  reachable(id: string): TreeNode | undefined {
    const node = this.nodes.get(id);
    if (node === undefined) return undefined;
    const top = this.ancestorsOf(node).at(-1) ?? node;
    return top.parent === null ? node : undefined;
  }

  register(id: string, config: NodeConfig): void {
    if (this.nodes.has(id)) return;
    const parent = config.parent ?? null;
    const slot = this.slots.get(parent) ?? 0;
    const index = config.index ?? slot;
    this.slots.set(parent, Math.max(slot, index + 1));
    this.sequence += 1;
    const node: TreeNode = {
      id,
      parent,
      index,
      seq: this.sequence,
      focusable: config.focusable ?? false,
      orientation: config.orientation ?? null,
      alignInGrid: config.alignInGrid ?? false,
      config,
      activeChild: null,
    };
    this.nodes.set(id, node);
    if (parent === null || this.nodes.has(parent)) this.link(node);
    else this.hold(parent, node);
    this.attachHeld(id);
  }

  remove(node: TreeNode): void {
    this.unlink(node);
    for (const dead of this.subtree(node)) {
      this.nodes.delete(dead.id);
      this.children.delete(dead.id);
      this.slots.delete(dead.id);
    }
  }

  /** `node`'s ancestors, nearest first. */
  ancestorsOf(node: TreeNode): TreeNode[] {
    const ancestors: TreeNode[] = [];
    const seen = new Set([node.id]);
    let parent = this.parentOf(node);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      ancestors.push(parent);
      parent = this.parentOf(parent);
    }
    return ancestors;
  }

  contains(ancestor: TreeNode, node: TreeNode): boolean {
    return node === ancestor || this.ancestorsOf(node).includes(ancestor);
  }

  /** `node`'s siblings on each side of it, nearest first. */
  siblingsAround(node: TreeNode): Siblings {
    const siblings = this.childrenOf(node.parent);
    const at = siblings.indexOf(node);
    return { before: siblings.slice(0, at).reverse(), after: siblings.slice(at + 1) };
  }

  /** The child `node` was last left on, while it is still one of its children. */
  activeChildOf(node: TreeNode): TreeNode | undefined {
    const remembered = node.activeChild;
    if (remembered === null) return undefined;
    return this.childrenOf(node.id).find((child) => child.id === remembered);
  }

  remember(node: TreeNode): void {
    let child = node;
    for (const parent of this.ancestorsOf(node)) {
      parent.activeChild = child.id;
      child = parent;
    }
  }

  private parentOf(node: TreeNode): TreeNode | undefined {
    return node.parent === null ? undefined : this.nodes.get(node.parent);
  }

  private link(node: TreeNode): void {
    const siblings = this.children.get(node.parent) ?? [];
    this.children.set(node.parent, siblings);
    // The end first. Children arrive in order almost always - a rail's tiles,
    // a grid's rows - and that is the case the scan below is worst at: it walks
    // every sibling only to fall off the end and append anyway, which is what
    // made a wide container cost the square of its width to fill.
    const last = siblings.at(-1);
    if (last === undefined || sortsAfter(node, last)) {
      siblings.push(node);
      return;
    }
    const at = siblings.findIndex((sibling) => sortsAfter(sibling, node));
    siblings.splice(at < 0 ? siblings.length : at, 0, node);
  }

  private unlink(node: TreeNode): void {
    const held = node.parent === null ? undefined : this.waiting.get(node.parent);
    const siblings = held ?? this.children.get(node.parent) ?? [];
    const at = siblings.indexOf(node);
    if (at >= 0) siblings.splice(at, 1);
  }

  private hold(parent: string, node: TreeNode): void {
    const held = this.waiting.get(parent) ?? [];
    held.push(node);
    this.waiting.set(parent, held);
  }

  private attachHeld(parent: string): void {
    const held = this.waiting.get(parent);
    if (!held) return;
    this.waiting.delete(parent);
    for (const node of held) this.link(node);
  }

  private subtree(node: TreeNode): TreeNode[] {
    return [node, ...this.childrenOf(node.id).flatMap((child) => this.subtree(child))];
  }
}
