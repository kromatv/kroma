import { componentName } from '../component-names';
import { type HostBox, hostBox } from './host-box';
import { hostClip } from './host-clip';
import { hostView } from './host-view';
import { type PropSummary, summarizeProps } from './prop-summary';
import {
  childOf,
  componentOf,
  type Fiber,
  heldByHook,
  isHidden,
  isHost,
  propsOf,
  siblingOf,
} from './react-fiber';
import { type Roster, type ScreenControl, screenControl } from './screen-controls';
import type { TextClip } from './text-clip';

/** A mounted kit component: its public name, its props, its box, whether it
 *  holds the focus, on a `Text` what its box cuts off it, the control it runs,
 *  and the kit components under it. A component the kit did not name is here
 *  too when it runs a control, under the control's kind. */
export type KitNode = {
  name: string;
  props: PropSummary;
  box: HostBox | null;
  focused?: true;
  clipped?: TextClip;
  control?: ScreenControl;
  children: KitNode[];
};

/** The kit components of every mounted root, and how many fibers were read. */
export type ScreenTree = { fibers: number; nodes: KitNode[] };

type Visit = { fiber: Fiber; owner: KitNode };

const NO_CONTROLS: Roster = new Map();

const TEXT = 'Text';

function markClip(node: KitNode, fiber: Fiber): void {
  const clipped = node.name === TEXT ? hostClip(fiber) : null;
  if (clipped) {
    node.clipped = clipped;
  }
}

function nodeOf(fiber: Fiber, roster: Roster): KitNode | null {
  const mounted = heldByHook(fiber, roster);
  const name = componentName(componentOf(fiber)) ?? mounted?.control.definition.name;
  if (name === undefined) {
    return null;
  }
  const node: KitNode = {
    name,
    props: summarizeProps(name, propsOf(fiber)),
    box: hostBox(fiber),
    children: [],
  };
  markClip(node, fiber);
  if (mounted) {
    node.control = screenControl(name, fiber, mounted);
  }
  return node;
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
 *  kit named (`componentName`) and those that run a control of `roster`, and
 *  marking the nearest one around each element in `held`, the elements that
 *  hold the focus. */
export function readScreen(
  trees: Iterable<Fiber>,
  held: ReadonlySet<unknown>,
  roster: Roster = NO_CONTROLS,
): ScreenTree {
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
    const node = nodeOf(fiber, roster);
    if (node) {
      owner.children.push(node);
    }
    push(pending, childOf(fiber), node ?? owner);
  }
  return { fibers, nodes: top.children };
}
