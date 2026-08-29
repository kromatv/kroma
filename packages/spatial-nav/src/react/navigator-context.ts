import type { SpatialNavigator } from '@kroma/spatial-nav';
import { createContext, useContext } from 'react';

interface NavigatorHost {
  navigator: SpatialNavigator;
  requestFocus: (id: string) => void;
  claimFocus: (id: string) => void;
}

interface NodeHost {
  host: NavigatorHost;
  parentId: string;
}

const MISSING_ROOT = 'No registered spatial navigator: mount a <NavigatorRoot> above this tree.';

const HostContext = createContext<NavigatorHost | null>(null);
const ParentIdContext = createContext<string | null>(null);

function useNavigatorHost(): NavigatorHost | null {
  return useContext(HostContext);
}

function useNodeHost(): NodeHost {
  const host = useContext(HostContext);
  const parentId = useContext(ParentIdContext);
  if (!host || !parentId) throw new Error(MISSING_ROOT);
  return { host, parentId };
}

/** The navigator answering this part of the tree. Throws when nothing above it
 *  mounted a `<NavigatorRoot>`. */
function useNavigator(): SpatialNavigator {
  return useNodeHost().host.navigator;
}

export type { NavigatorHost };
export { HostContext, ParentIdContext, useNavigator, useNavigatorHost, useNodeHost };
