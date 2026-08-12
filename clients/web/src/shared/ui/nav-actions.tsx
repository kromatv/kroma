import { createContext, type ReactNode, useContext } from 'react';

const NavActionsContext = createContext<ReactNode>(null);

/**
 * The controls every navigation band pins to its far end, the catalogue's and
 * the console's alike: the notification bell today.
 *
 * Stated once by the shell that sits above both, because a navigation living in
 * `shared/` must not reach into a feature for them and neither sidebar may
 * reach into the other's.
 */
export function NavActionsProvider({
  actions,
  children,
}: Readonly<{ actions: ReactNode; children: ReactNode }>) {
  return <NavActionsContext.Provider value={actions}>{children}</NavActionsContext.Provider>;
}

/** What the shell pinned there, or nothing where it said nothing. */
export function useNavActions(): ReactNode {
  return useContext(NavActionsContext);
}
