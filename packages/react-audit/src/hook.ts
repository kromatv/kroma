// React hands its fiber tree to whatever sits on `__REACT_DEVTOOLS_GLOBAL_HOOK__`
// when the renderer initialises. That is the whole mechanism this library rests
// on, and it is the same one React DevTools uses.
//
// TIMING MATTERS: the renderer reads that global ONCE, at module init. Importing
// this file installs the hook as a side effect, so importing the library before
// react-dom is enough. In a test runner, the reliable way to guarantee that is a
// setup file:
//
//   setupFiles: ['@kroma/react-audit']
//
// Installing is idempotent and never replaces an existing hook, so having React
// DevTools open does not break it and vice versa.

import type { Fiber, Root } from './fiber';

type Listener = (root: Root) => void;
type Unmounted = (fiber: Fiber) => void;

interface Hook {
  renderers: Map<number, unknown>;
  supportsFiber: true;
  inject(renderer: unknown): number;
  onCommitFiberRoot(id: number, root: Root): void;
  onCommitFiberUnmount(id: number, fiber: Fiber): void;
  onPostCommitFiberRoot(): void;
  onScheduleFiberRoot(): void;
  checkDCE(): void;
  listeners: Set<Listener>;
  unmounts: Set<Unmounted>;
}

type Global = { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook };

/** Puts the hook in place if nothing has yet, and returns it either way. */
function installHook(): Hook {
  const global = globalThis as Global;
  const existing = global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) {
    existing.listeners ??= new Set();
    existing.unmounts ??= new Set();
    return existing;
  }

  let next = 1;
  const hook: Hook = {
    renderers: new Map(),
    supportsFiber: true,
    listeners: new Set(),
    unmounts: new Set(),
    inject(renderer) {
      const id = next++;
      hook.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      for (const listener of hook.listeners) listener(root);
    },
    // The one unambiguous signal in the whole library: React is deleting this
    // fiber. Everything else has to be inferred.
    onCommitFiberUnmount(_id, fiber) {
      for (const listener of hook.unmounts) listener(fiber);
    },
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
  };
  global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  return hook;
}

/** Calls `listener` on every commit until the returned function is called. */
function onCommit(listener: Listener): () => void {
  const hook = installHook();
  hook.listeners.add(listener);
  return () => {
    hook.listeners.delete(listener);
  };
}

/** Calls `listener` for every fiber React deletes, until the returned function
 * is called. */
function onUnmount(listener: Unmounted): () => void {
  const hook = installHook();
  hook.unmounts.add(listener);
  return () => {
    hook.unmounts.delete(listener);
  };
}

/** Whether a React renderer has actually connected. False means the hook was
 * installed too late, which is the one failure worth telling a caller about. */
function isConnected(): boolean {
  return (globalThis as Global).__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers.size !== 0;
}

export type { Listener, Unmounted };
export { installHook, isConnected, onCommit, onUnmount };

installHook();
