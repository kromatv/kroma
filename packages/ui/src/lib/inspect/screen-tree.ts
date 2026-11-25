import { componentName } from '../component-names';
import { type HostBox, hostBox } from './host-box';
import { hostView } from './host-view';
import { type PropSummary, summarizeProps } from './prop-summary';
import {
  childOf,
  componentOf,
  type Fiber,
  isHidden,
  isHost,
  propsOf,
  siblingOf,
} from './react-fiber';

/** A mounted kit component: its public name, its props, its box, whether it
 *  holds the focus, and the kit components under it. */
export type KitNode = {
  name: string;
  props: PropSummary;
  box: HostBox | null;
  focused?: true;
  children: KitNode[];
};

/** The kit components of every mounted root, and how many fibers were read. */
export type ScreenTree = { fibers: number; nodes: KitNode[] };

type Visit = { fiber: Fiber; owner: KitNode };

function nodeOf(fiber: Fiber): KitNode | null {
  const name = componentName(componentOf(fiber));
  if (name === undefined) {
    return null;
  }
  return { name, props: summarizeProps(name, propsOf(fiber)), box: hostBox(fiber), children: [] };
}

function push(pending: Visit[], fiber: Fiber | null, owner: KitNode): void {
  if (fiber) {
    pending.push({ fiber, owner });
  }
}

function markFocus(fiber: Fiber, owner: KitNode, held: ReadonlySet<unknown>): void {
  if (held.size > 0 && isHost(fiber) && held.has(hostView(fiber))) {
    owner.focused = true;
  }
}

/** Walks each committed tree once, depth first, keeping only the components the
 *  kit named (`componentName`) and marking the nearest one around each element
 *  in `held`, the elements that hold the focus. */
export function readScreen(trees: Iterable<Fiber>, held: ReadonlySet<unknown>): ScreenTree {
  const top: KitNode = { name: '', props: {}, box: null, children: [] };
  const pending: Visit[] = [];
  for (const tree of trees) {
    push(pending, tree, top);
  }
  pending.reverse();
  let fibers = 0;
  for (let visit = pending.pop(); visit; visit = pending.pop()) {
    fibers += 1;
    const { fiber, owner } = visit;
    push(pending, siblingOf(fiber), owner);
    if (isHidden(fiber)) {
      continue;
    }
    markFocus(fiber, owner, held);
    const node = nodeOf(fiber);
    if (node) {
      owner.children.push(node);
    }
    push(pending, childOf(fiber), node ?? owner);
  }
  return { fibers, nodes: top.children };
}
