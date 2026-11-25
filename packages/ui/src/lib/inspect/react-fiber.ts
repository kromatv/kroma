/** A node of React's internal tree, opaque outside this file. */
export type Fiber = object;

const CLASS = 1;
const HOST_ROOT = 3;
const HOST = 5;
const FORWARD_REF = 11;
const MEMO = 14;
const SIMPLE_MEMO = 15;
const OFFSCREEN = 22;
const COMPONENT_TAGS: ReadonlySet<number> = new Set([0, CLASS, FORWARD_REF, MEMO, SIMPLE_MEMO]);
const HOOK_TAGS: ReadonlySet<number> = new Set([0, FORWARD_REF, SIMPLE_MEMO]);

/** One field of an object React keeps, or undefined for anything else. */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function fiberAt(value: unknown, key: string): Fiber | null {
  const found = field(value, key);
  return typeof found === 'object' && found !== null ? found : null;
}

function tag(fiber: Fiber): number {
  const value = field(fiber, 'tag');
  return typeof value === 'number' ? value : -1;
}

/** The fiber a mounted class instance sits on. */
export function fiberOfInstance(instance: unknown): Fiber | null {
  return fiberAt(instance, '_reactInternals');
}

/** The root a fiber belongs to, and the tree that root last committed. */
export function committedTree(fiber: Fiber): { root: object; current: Fiber } | null {
  let at: Fiber | null = fiber;
  while (at && tag(at) !== HOST_ROOT) {
    at = fiberAt(at, 'return');
  }
  const root = at && fiberAt(at, 'stateNode');
  const current = root && fiberAt(root, 'current');
  return root && current ? { root, current } : null;
}

export function childOf(fiber: Fiber): Fiber | null {
  return fiberAt(fiber, 'child');
}

export function siblingOf(fiber: Fiber): Fiber | null {
  return fiberAt(fiber, 'sibling');
}

/** What a component fiber was created from (`memo` and `forwardRef` objects
 *  included), or undefined for a host, a fragment, a provider or a portal. */
export function componentOf(fiber: Fiber): unknown {
  return COMPONENT_TAGS.has(tag(fiber)) ? field(fiber, 'elementType') : undefined;
}

/** The first entry of `known` that a hook of the function component on this
 *  fiber holds, whichever hook that is. Undefined for any other fiber. */
export function heldByHook<T>(fiber: Fiber, known: ReadonlyMap<unknown, T>): T | undefined {
  if (known.size === 0 || !HOOK_TAGS.has(tag(fiber))) {
    return undefined;
  }
  for (let hook = field(fiber, 'memoizedState'); hook; hook = field(hook, 'next')) {
    const found = known.get(field(hook, 'memoizedState'));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function propsOf(fiber: Fiber): unknown {
  return field(fiber, 'memoizedProps');
}

/** Whether the fiber is a host element (a DOM element, a native view). */
export function isHost(fiber: Fiber): boolean {
  return tag(fiber) === HOST;
}

/** What the renderer keeps on a host fiber: the element on the web, the
 *  instance holding the shadow node under Fabric. */
export function hostNodeOf(fiber: Fiber): unknown {
  return field(fiber, 'stateNode');
}

/** Whether the subtree is mounted but hidden (a suspended boundary's content,
 *  a hidden `<Activity>`). */
export function isHidden(fiber: Fiber): boolean {
  return tag(fiber) === OFFSCREEN && field(fiber, 'memoizedState') !== null;
}
