import { createContext, useContext } from 'react';

interface LockActions {
  lock: () => void;
  unlock: () => void;
}

const UNLOCKABLE: LockActions = { lock: () => undefined, unlock: () => undefined };

const LockContext = createContext<LockActions>(UNLOCKABLE);

/** Holds the navigator this component sits in out of the remote while a surface
 *  is up. The count is the navigator's, so overlapping surfaces unlock in any
 *  order; outside a `<NavigatorRoot>` both actions are no-ops. */
function useLockNavigator(): LockActions {
  return useContext(LockContext);
}

export type { LockActions };
export { LockContext, useLockNavigator };
