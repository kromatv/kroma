import { type Direction, SpatialNavigator } from '@kroma/spatial-nav';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeRemote } from './configure-remote';
import { focusQueue } from './focus-queue';
import { HostContext, type NavigatorHost, ParentIdContext } from './navigator-context';
import { LockContext } from './use-lock-navigator';

const ROOT_ID = 'root';

interface NavigatorRootProps {
  children: ReactNode;
  /** Whether this navigator answers the remote. False parks the scope: its
   *  nodes stay registered, in the order they registered, while the presses go
   *  to whichever navigator is still listening. */
  active?: boolean;
  /** A direction the navigator handled with nothing to move to. */
  onEdge?: (direction: Direction) => void;
}

/**
 * One navigator, for one screen. Several can be mounted at once; a press
 * reaches all of them and only the unlocked ones answer, which is how a dialog
 * takes the remote from the screen it opened over.
 */
function NavigatorRoot({ children, active = true, onEdge }: Readonly<NavigatorRootProps>) {
  const [navigator] = useState(() => new SpatialNavigator());
  const [queue] = useState(() => focusQueue(navigator));

  const host = useMemo<NavigatorHost>(
    () => ({ navigator, requestFocus: queue.request, claimFocus: queue.claim }),
    [navigator, queue],
  );
  const lock = useMemo(
    () => ({ lock: () => navigator.lock(), unlock: () => navigator.unlock() }),
    [navigator],
  );

  const edge = useRef(onEdge);
  edge.current = onEdge;

  useEffect(() => {
    navigator.registerNode(ROOT_ID, { orientation: 'vertical' });
    return () => navigator.unregisterNode(ROOT_ID);
  }, [navigator]);

  useEffect(() => {
    navigator.onEdge = (direction) => edge.current?.(direction);
    return () => {
      navigator.onEdge = undefined;
    };
  }, [navigator]);

  useEffect(() => subscribeRemote((direction) => navigator.handle(direction)), [navigator]);

  useEffect(() => {
    if (active) return;
    navigator.lock();
    return () => navigator.unlock();
  }, [active, navigator]);

  // A branch that mounts whole under a root that does not re-render is the
  // shape the queue exists for: the tile registers and asks before its own
  // parent has registered, and no render of this component follows to go back
  // for it. So the retry hangs off registration, which is where the tree
  // becomes whole, and the effect below stays only as the backstop.
  useEffect(() => {
    navigator.onRegister = queue.flush;
    return () => {
      navigator.onRegister = undefined;
    };
  }, [navigator, queue]);

  useEffect(queue.flush);

  return (
    <HostContext.Provider value={host}>
      <LockContext.Provider value={lock}>
        <ParentIdContext.Provider value={ROOT_ID}>{children}</ParentIdContext.Provider>
      </LockContext.Provider>
    </HostContext.Provider>
  );
}

export type { NavigatorRootProps };
export { NavigatorRoot };
