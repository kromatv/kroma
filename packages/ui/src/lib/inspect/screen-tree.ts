import { componentName } from '../component-names';
import { type HostBox, hostBox } from './host-box';
import { type PropSummary, summarizeProps } from './prop-summary';
import { childOf, componentOf, type Fiber, isHidden, propsOf, siblingOf } from './react-fiber';

/** A mounted kit component: its public name, its props, its box, and the kit
 *  components under it. */
export type KitNode = {
  name: string;
  props: PropSummary;
  box: HostBox | null;
  children: KitNode[];
};

/** The kit components of every mounted root, and how many fibers were read. */
export type ScreenTree = { fibers: number; nodes: KitNode[] };

type Visit = { fiber: Fiber; into: KitNode[] };

function nodeOf(fiber: Fiber): KitNode | null {
  const name = componentName(componentOf(fiber));
  if (name === undefined) {
    return null;
  }
  return { name, props: summarizeProps(name, propsOf(fiber)), box: hostBox(fiber), children: [] };
}

function push(pending: Visit[], fiber: Fiber | null, into: KitNode[]): void {
  if (fiber) {
    pending.push({ fiber, into });
  }
}

/** Walks each committed tree once, depth first, keeping only the components the
 *  kit named (`componentName`). */
export function readScreen(trees: Iterable<Fiber>): ScreenTree {
  const nodes: KitNode[] = [];
  const pending: Visit[] = [];
  for (const tree of trees) {
    push(pending, tree, nodes);
  }
  pending.reverse();
  let fibers = 0;
  for (let visit = pending.pop(); visit; visit = pending.pop()) {
    fibers += 1;
    const { fiber, into } = visit;
    push(pending, siblingOf(fiber), into);
    if (isHidden(fiber)) {
      continue;
    }
    const node = nodeOf(fiber);
    if (node) {
      into.push(node);
    }
    push(pending, childOf(fiber), node ? node.children : into);
  }
  return { fibers, nodes };
}
