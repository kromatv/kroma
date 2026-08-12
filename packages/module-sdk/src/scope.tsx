// A module page's own identity, supplied by the host that mounts it.
//
// A module must never name itself: its id lives in `module.json`, and a copy in
// TypeScript is one more thing to keep in sync. The host already resolves which
// module a route belongs to, so it provides that id here and the module reads
// its API through `useModuleApi()` without ever spelling the id out. Naming a
// module is then reserved for what it should mean: addressing a DIFFERENT one.

import type { ModuleApi } from '@kroma/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useAdminHost } from './admin/context';

const ModuleIdContext = createContext<string | null>(null);

/** Mounted by the host around a module's page, carrying that module's id. */
export function ModuleScope({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return <ModuleIdContext.Provider value={id}>{children}</ModuleIdContext.Provider>;
}

/** This module's own admin API, bound to `/api/admin/m/<its id>`. Paths are
 *  relative to that mount, so `get('/vpn')` reads the module's own `/vpn`. */
export function useModuleApi(): ModuleApi {
  const id = useContext(ModuleIdContext);
  const { client } = useAdminHost();
  const api = useMemo(() => (id === null ? null : client.module(id)), [client, id]);
  if (api === null) {
    throw new Error('useModuleApi must be used inside a module page (the host mounts ModuleScope)');
  }
  return api;
}

/** Build a module's typed API hook from a factory over its `ModuleApi`.
 *
 *  `moduleApiHook(factory)` binds to whichever module the host is rendering
 *  (via `ModuleScope`), so the module never names itself. The `(id, factory)`
 *  form binds an explicit id instead: that is the shape for an API other
 *  packages call: the id others reach the module at, published once, next to
 *  the methods it addresses. */
export function moduleApiHook<T>(factory: (api: ModuleApi) => T): () => T;
export function moduleApiHook<T>(id: string, factory: (api: ModuleApi) => T): () => T;
export function moduleApiHook<T>(
  idOrFactory: string | ((api: ModuleApi) => T),
  boundFactory?: (api: ModuleApi) => T,
): () => T {
  if (typeof idOrFactory === 'string') {
    const id = idOrFactory;
    const factory = boundFactory as (api: ModuleApi) => T;
    return function useBoundModuleApi(): T {
      const { client } = useAdminHost();
      return useMemo(() => factory(client.module(id)), [client]);
    };
  }
  const factory = idOrFactory;
  return function useScopedModuleApi(): T {
    const api = useModuleApi();
    return useMemo(() => factory(api), [api]);
  };
}
