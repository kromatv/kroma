import { domainModules, type KromaClient } from '@kromatv/client';
import {
  depEntries,
  type KromaModule,
  type ModuleManifest,
  type ModuleRegistry,
  remoteEntryUrl,
  SHARED_GLOBAL,
  type SharedModule,
} from '@kromatv/module-sdk';
import { apiBase } from '#web/shared/lib/api';

interface RemoteSpec {
  id: string;
  entry: string;
}

/** What the host hands a runtime-loaded module, by the specifier its source
 *  imported. Loaded on demand: a page with no module installed pays nothing.
 *  A workspace barrel goes through a one-line re-export in `scope/`: the app
 *  imports these barrels statically, and a namespace `import()` of a module
 *  the app also imports keeps every export of it alive in the app's own chunk,
 *  which put the whole kit and the player on first paint. */
const PROVIDERS: Record<SharedModule, () => Promise<unknown>> = {
  react: () => import('react'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  'react/jsx-dev-runtime': () => import('react/jsx-dev-runtime'),
  'react-dom': () => import('react-dom'),
  'react-native': () => import('react-native'),
  '@kromatv/module-sdk': () => import('#web/modules/scope/module-sdk'),
  '@kromatv/ui': () => import('#web/modules/scope/ui'),
  '@kromatv/ui/kit': () => import('#web/modules/scope/ui-kit'),
  '@kromatv/ui/tokens': () => import('#web/modules/scope/ui-tokens'),
  '@kromatv/core': () => import('#web/modules/scope/core'),
  '@kromatv/core/react': () => import('#web/modules/scope/core-react'),
  '@kromatv/client': () => import('#web/modules/scope/client'),
  '@kromatv/client/query': () => import('#web/modules/scope/client-query'),
  '@kromatv/i18n': () => import('#web/modules/scope/i18n'),
  '@kromatv/i18n/react': () => import('#web/modules/scope/i18n-react'),
  '@tanstack/react-query': () => import('@tanstack/react-query'),
  '@tanstack/react-router': () => import('@tanstack/react-router'),
  'react-call': () => import('react-call'),
};

/** Everything a runtime module imports from the host, keyed by specifier. */
export async function provideShared(): Promise<Record<string, unknown>> {
  const providers: [string, () => Promise<unknown>][] = [
    ...Object.entries(PROVIDERS),
    ...Object.entries(domainModules).map(
      ([domain, load]) => [`@kromatv/client/${domain}`, load] as [string, () => Promise<unknown>],
    ),
  ];
  const loaded = await Promise.all(
    providers.map(async ([key, load]) => [key, await load()] as const),
  );
  return Object.fromEntries(loaded);
}

async function discoverRemotes(client?: KromaClient): Promise<RemoteSpec[]> {
  const res = await fetch(`${apiBase()}/api/modules`, {
    headers: client?.authHeaders() ?? {},
  });
  if (!res.ok) return [];
  const mods = (await res.json()) as ModuleManifest[];
  return mods
    .filter((m) => m.feRemote != null && m.enabled !== false)
    .map((m) => ({ id: m.id, entry: remoteEntryUrl(apiBase(), m.id) }));
}

/** The seams a test replaces: how the shared map is built, how an entry is imported. */
export interface RemoteLoaders {
  provideShared: () => Promise<Record<string, unknown>>;
  importRemote: (entry: string) => Promise<{ default?: KromaModule }>;
}

const DEFAULT_LOADERS: RemoteLoaders = {
  provideShared,
  importRemote: (entry) => import(/* @vite-ignore */ entry),
};

function unmet(registry: ModuleRegistry, m: KromaModule): string | null {
  return depEntries(m.dependencies).find(({ id }) => !registry.has(id))?.id ?? null;
}

/** Remote loading state belongs to one mounted module host. */
export function createRuntimeRemotes(client?: KromaClient) {
  const loadedRemotes = new Set<string>();
  let sharedReady: Promise<void> | null = null;

  let disposed = false;
  function ensureShared(loaders: RemoteLoaders): Promise<void> {
    sharedReady ??= loaders
      .provideShared()
      .then((shared) => {
        Reflect.set(globalThis, SHARED_GLOBAL, shared);
      })
      .catch((e) => {
        sharedReady = null;
        throw e;
      });
    return sharedReady;
  }

  async function fetchRemote(
    spec: RemoteSpec,
    loaders: RemoteLoaders,
  ): Promise<KromaModule | null> {
    loadedRemotes.add(spec.id);
    try {
      const mod = (await loaders.importRemote(spec.entry)).default;
      if (mod) return mod;
      console.warn(`[modules] runtime remote "${spec.id}" has no default export`);
    } catch (e) {
      console.warn(`[modules] runtime remote "${spec.id}" failed to load`, e);
    }
    loadedRemotes.delete(spec.id);
    return null;
  }

  /** Registers what loaded, then drops whatever cannot resolve: a module whose
   *  hard dependency is absent (and, in turn, anything that needed it), or the
   *  whole batch on a cycle. Validated as a set, so the order the entries
   *  arrived in cannot decide which modules survive. */
  function settle(registry: ModuleRegistry, fresh: KromaModule[]): string[] {
    const added = fresh.filter((m) => !registry.has(m.id));
    for (const m of added) registry.register(m);
    const drop = (m: KromaModule, why: string) => {
      registry.unregister(m.id);
      loadedRemotes.delete(m.id);
      console.warn(`[modules] runtime remote "${m.id}" unregistered: ${why}`);
    };
    const kept = new Set(added);
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of kept) {
        const missing = unmet(registry, m);
        if (missing === null) continue;
        drop(m, `depends on "${missing}", which is not installed`);
        kept.delete(m);
        changed = true;
      }
    }
    try {
      registry.order();
    } catch (err) {
      for (const m of kept)
        drop(m, `dependency cycle (${err instanceof Error ? err.message : err})`);
      return [];
    }
    return [...kept].map((m) => m.id);
  }

  /** Load any not-yet-loaded frontend remotes into `registry` and return the ids
   *  newly registered. Re-callable, best-effort, and a no-op during SSR. */
  async function loadRuntimeRemotes(
    registry: ModuleRegistry,
    loaders: RemoteLoaders = DEFAULT_LOADERS,
  ): Promise<string[]> {
    if (disposed || typeof window === 'undefined') return [];
    let specs: RemoteSpec[];
    try {
      specs = await discoverRemotes(client);
    } catch (e) {
      console.warn('[modules] remote discovery failed', e);
      return [];
    }
    if (disposed) return [];
    const fresh = specs.filter((s) => !loadedRemotes.has(s.id));
    if (fresh.length === 0) return [];
    try {
      await ensureShared(loaders);
    } catch (e) {
      console.warn('[modules] shared modules failed to load', e);
      return [];
    }
    if (disposed) return [];
    const loaded = await Promise.all(fresh.map((s) => fetchRemote(s, loaders)));
    if (disposed) return [];
    return settle(
      registry,
      loaded.filter((m): m is KromaModule => m !== null),
    );
  }

  /** Whether this module's frontend was loaded as a runtime remote. */
  function isLoadedRemote(id: string): boolean {
    return loadedRemotes.has(id);
  }

  /** Forget a remote so a later reinstall re-loads it; the already-loaded code
   *  stays in memory. */
  function forgetRemote(id: string): void {
    loadedRemotes.delete(id);
  }

  return {
    loadRuntimeRemotes,
    isLoadedRemote,
    forgetRemote,
    dispose() {
      disposed = true;
      loadedRemotes.clear();
    },
  };
}
