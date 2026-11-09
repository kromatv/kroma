import { type DirectConnectionView, useDirectConnection } from '@kromatv/ui';
import { createContext, type ReactNode, useContext } from 'react';
import { useAuth } from '#web/shared/lib/auth';

const Context = createContext<DirectConnectionView | null>(null);

/** Keeps the signed-in client on a direct route to its server when the browser
 * allows one, for every screen below. */
export function DirectConnectionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user } = useAuth();
  const view = useDirectConnection(client, Boolean(user));
  return <Context.Provider value={view}>{children}</Context.Provider>;
}

export function useDirectRoute(): DirectConnectionView {
  const view = useContext(Context);
  if (!view) throw new Error('DirectConnectionProvider is required');
  return view;
}
