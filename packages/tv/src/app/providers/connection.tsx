import type {
  Activity,
  CompatVerdict,
  KromaClient,
  MediaItem,
  SavedServer,
  Show,
} from '@kroma/core';
import { createContext, type ReactNode, useContext } from 'react';
import type { DeepLink } from '#tv/shared/preview';

export type ConnectStatus = 'discovering' | 'connecting' | 'ready' | 'error';

/** Multi-server connection state for the TV: the catalogue and `client` always
 * reflect the active server, `servers` and `discovered` drive the picker. */
export interface Connection {
  platform: string;
  status: ConnectStatus;
  servers: SavedServer[];
  activeServerUrl: string | null;
  activeServerName: string | null;
  error: string;
  online: boolean;
  serverVersion: string | null;
  compat: CompatVerdict;
  client: KromaClient | null;
  movies: MediaItem[];
  shows: Show[];
  activity: Activity | null;
  discovering: boolean;
  discovered: string[];
  deepLink: DeepLink | null;
  addServer: (url: string, name?: string | null) => void;
  setActiveServer: (url: string) => void;
  discover: () => void;
  forgetServer: (url: string) => void;
  clearDeepLink: () => void;
}

const ConnectionCtx = createContext<Connection | null>(null);

export function ConnectionProvider({
  value,
  children,
}: Readonly<{
  value: Connection;
  children: ReactNode;
}>) {
  return <ConnectionCtx.Provider value={value}>{children}</ConnectionCtx.Provider>;
}

export function useConnection(): Connection {
  const c = useContext(ConnectionCtx);
  if (!c) throw new Error('useConnection() must be used inside <ConnectionProvider>');
  return c;
}

/** Like {@link useConnection}, but standing alone: `null` outside the
 * provider, for shared screens that component tests mount without the app
 * shell (the auth screens' splash artwork degrades to none). */
export function useConnectionMaybe(): Connection | null {
  return useContext(ConnectionCtx);
}
