import { hasPermission, type TVars } from '@kroma/core';
import type { KromaHost, ModuleNav, ModulePanel, ModuleRoute } from '@kroma/module-sdk';
import { useScopedT, useT } from '@kroma/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useModuleHost } from '#web/modules/host';
import { hiddenModuleIds } from '#web/modules/module-gating';
import { moduleRegistry } from '#web/modules/registry';
import { forgetRemote, isLoadedRemote, loadRuntimeRemotes } from '#web/modules/remotes';
import { useAuth } from '#web/shared/lib/auth';

/** A translator bound to one module's own catalogs, falling back to the core
 *  ones. The module's messages were registered with the engine when the module
 *  was, so this is the scope, not a second lookup. */
export function useModuleT(moduleId: string): (key: string, vars?: TVars) => string {
  return useT(moduleId);
}

interface ModuleHostValue {
  host: KromaHost | null;
  nav: ModuleNav[];
  routes: ModuleRoute[];
  panels: ModulePanel[];
  disabledIds: ReadonlySet<string>;
  refresh: () => Promise<void>;
}

const EMPTY: ModuleHostValue = {
  host: null,
  nav: [],
  routes: [],
  panels: [],
  disabledIds: new Set(),
  refresh: async () => {},
};

const ModuleHostContext = createContext<ModuleHostValue>(EMPTY);

export function ModuleHostProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);
  const host = useModuleHost(revision);

  // A module is visible only when the backend lists it AND it is enabled: a
  // compile-time-bundled UI may have no installed backend at all. Keyed
  // ['modules'] so it dedupes with the host's own fetch.
  const { data: manifest } = useQuery({
    queryKey: ['modules'],
    queryFn: () => (host ? host.api.listModules() : Promise.resolve([])),
    enabled: host != null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision re-reads the registry ids after an install/uninstall
  const disabledIds = useMemo(
    () => hiddenModuleIds(manifest, moduleRegistry.ids()),
    [manifest, revision],
  );

  // The arrays hold stable lazy component refs, so panels don't retry into a
  // Suspense loop under the compiler.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; revision re-snapshots contributions after an install/uninstall
  const contrib = useMemo<{
    nav: ModuleNav[];
    routes: ModuleRoute[];
    panels: ModulePanel[];
  }>(() => {
    if (!host) return { nav: [], routes: [], panels: [] };
    try {
      return {
        nav: moduleRegistry.navItems(),
        routes: moduleRegistry.routes(),
        panels: moduleRegistry.settingsPanels(),
      };
    } catch {
      // A graph that failed to resolve has no usable contributions; stay empty
      // rather than crash the whole app.
      return { nav: [], routes: [], panels: [] };
    }
  }, [host, revision]);

  const refresh = useCallback(async () => {
    await loadRuntimeRemotes(moduleRegistry);
    try {
      const listed = host ? await host.api.listModules() : [];
      const present = new Set(listed.map((m) => m.id));
      for (const id of moduleRegistry.ids()) {
        if (!present.has(id) && isLoadedRemote(id)) {
          moduleRegistry.unregister(id);
          forgetRemote(id);
        }
      }
    } catch (e) {
      console.warn('[modules] refresh reconcile failed', e);
    }
    await queryClient.invalidateQueries({ queryKey: ['modules'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
    setRevision((r) => r + 1);
  }, [host, queryClient]);

  const value = useMemo<ModuleHostValue>(
    () => ({
      host,
      nav: contrib.nav,
      routes: contrib.routes,
      panels: contrib.panels,
      disabledIds,
      refresh,
    }),
    [host, contrib, disabledIds, refresh],
  );
  return <ModuleHostContext.Provider value={value}>{children}</ModuleHostContext.Provider>;
}

/** The wired module host, or null until modules finish starting. */
export function useModuleHostValue(): KromaHost | null {
  return useContext(ModuleHostContext).host;
}

/** Soft-reload the module set after an install/uninstall, without a page reload. */
export function useRefreshModules(): () => Promise<void> {
  return useContext(ModuleHostContext).refresh;
}

/** Every nav entry the current account may see (enabled module + met `requires`
 *  capability). A `label` with no matching catalog key passes through as-is. */
export function useModuleNavAll(): ModuleNav[] {
  const { nav, disabledIds } = useContext(ModuleHostContext);
  const { user } = useAuth();
  const tOf = useScopedT();
  return useMemo(
    () =>
      nav
        .filter((n) => {
          if (disabledIds.has(n.moduleId)) return false;
          if (n.requires) {
            const cap = n.requires as Parameters<typeof hasPermission>[1];
            if (!user || !hasPermission(user, cap)) return false;
          }
          return true;
        })
        .map((n) => ({
          ...n,
          label: tOf(n.moduleId)(n.label),
        })),
    [nav, disabledIds, user, tOf],
  );
}

/** Nav entries for one nav-group id; an entry without a `section` counts as "library". */
export function useModuleNav(section: string): ModuleNav[] {
  const all = useModuleNavAll();
  return useMemo(() => all.filter((n) => (n.section ?? 'library') === section), [all, section]);
}

/** The route mounted at `path`, if its module is registered and enabled. */
export function useModuleRoute(path: string): ModuleRoute | undefined {
  const { routes, disabledIds } = useContext(ModuleHostContext);
  return useMemo(
    () => routes.find((r) => r.path === path && !disabledIds.has(r.moduleId)),
    [routes, disabledIds, path],
  );
}

export function useModuleSettingsPanels(moduleId: string): {
  host: KromaHost | null;
  panels: ModulePanel[];
} {
  const { host, panels } = useContext(ModuleHostContext);
  const forModule = useMemo(
    () => panels.filter((p) => p.moduleId === moduleId),
    [panels, moduleId],
  );
  return { host, panels: forModule };
}
