// The shape of React's fiber, as much of it as an audit needs, and the questions
// worth asking of one.
//
// None of this is public API of React's. It is the same tree React DevTools
// reads, through the same hook, and it is the only place the answer exists: a
// <Profiler> can time a commit, but it cannot name the forty components inside
// it, or say whether they re-rendered or were rebuilt.
//
// THE TRAP, and it is the whole reason this file is careful: React clones a
// fiber only when it actually works on it (`createWorkInProgress`, which is also
// the only place `flags` is reset and an `alternate` linked). A subtree that
// bails out is reused as-is, so its fibers keep the `flags` and the
// `alternate === null` they were BORN with, for the rest of the tree's life. In
// a 766-fiber keyboard, 691 fibers sit in that state permanently. So neither
// `flags` nor `alternate` means anything on its own; both are only readable on a
// fiber React has just written, and `record.ts` is what establishes which those
// are.

/** React's own flag for "this fiber rendered in the commit it was written in". */
const PERFORMED_WORK = 0b1;

/** `HostComponent`: a real element, a DOM node or a native view. */
const HOST_COMPONENT = 5;

interface Fiber {
  tag: number;
  type: unknown;
  flags: number;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  memoizedProps: unknown;
  memoizedState: unknown;
  actualDuration?: number;
}

interface Root {
  current: Fiber;
}

type Named = { displayName?: string; name?: string; render?: Named };

/** The name a person would recognise: the component's, or the element's. */
function nameOf(fiber: Fiber): string | null {
  const type = fiber.type;
  if (typeof type === 'string') return type;
  // A function is the component itself; an object is a wrapper (memo, forwardRef)
  // holding the one that has the name.
  if (typeof type === 'function') {
    const fn = type as Named;
    return fn.displayName ?? fn.name ?? null;
  }
  if (type && typeof type === 'object') {
    const wrapper = type as Named;
    return wrapper.displayName ?? wrapper.render?.displayName ?? wrapper.render?.name ?? null;
  }
  return null;
}

/** Whether this fiber is an element the platform draws: a `div` under react-dom,
 * an `RCTView` under React Native. */
function isHost(fiber: Fiber): boolean {
  return fiber.tag === HOST_COMPONENT;
}

/** Only meaningful on a fiber React has just written. See the note above. */
function performedWork(fiber: Fiber): boolean {
  return (fiber.flags & PERFORMED_WORK) !== 0;
}

/** Every fiber in the tree, depth first. */
function* walk(root: Root): Generator<Fiber> {
  const stack: (Fiber | null)[] = [root.current];
  while (stack.length > 0) {
    const fiber = stack.pop();
    if (!fiber) continue;
    yield fiber;
    stack.push(fiber.child, fiber.sibling);
  }
}

export type { Fiber, Root };
export { HOST_COMPONENT, isHost, nameOf, PERFORMED_WORK, performedWork, walk };
