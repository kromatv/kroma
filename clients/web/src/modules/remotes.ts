import { domainModules, sessionToken } from '@kroma/client';
import {
  depEntries,
  type KromaModule,
  type ModuleManifest,
  type ModuleRegistry,
  remoteEntryUrl,
  SHARED_GLOBAL,
  type SharedModule,
} from '@kroma/module-sdk';
import { apiBase } from '#web/shared/lib/api';

interface RemoteSpec {
  id: string;
  entry: string;
}

/** What the host hands a runtime-loaded module, by the specifier its source
 *  imported. Loaded on demand: a page with no module installed pays nothing. */
const PROVIDERS: Record<SharedModule, () => Promise<unknown>> = {
  react: () => import('react'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  'react/jsx-dev-runtime': () => import('react/jsx-dev-runtime'),
  'react-dom': () => import('react-dom'),
  'react-native': () => import('react-native'),
  '@kroma/module-sdk': () => import('@kroma/module-sdk'),
  '@kroma/ui': () => import('@kroma/ui'),
  '@kroma/ui/kit': () => import('@kroma/ui/kit'),
  '@kroma/ui/tokens': () => import('@kroma/ui/tokens'),
  '@kroma/core': () => import('@kroma/core'),
  '@kroma/core/react': () => import('@kroma/core/react'),
  '@kroma/client': () => import('@kroma/client'),
  '@kroma/client/query': () => import('@kroma/client/query'),
  '@kroma/i18n': () => import('@kroma/i18n'),
  '@kroma/i18n/react': () => import('@kroma/i18n/react'),
  '@tanstack/react-query': () => import('@tanstack/react-query'),
  '@tanstack/react-router': () => import('@tanstack/react-router'),
  'react-call': () => import('react-call'),
};

async function provideShared(): Promise<Record<string, unknown>> {
  const loaded = await Promise.all(
    Object.entries(PROVIDERS).map(async ([key, load]) => [key, await load()] as const),
  );
  const shared: Record<string, unknown> = Object.fromEntries(loaded);
  for (const [domain, mod] of Object.entries(domainModules)) {
    shared[`@kroma/client/${domain}`] = mod;
  }
  return shared;
}

async function discoverRemotes(): Promise<RemoteSpec[]> {
  const token = sessionToken();
  const res = await fetch(`${apiBase()}/api/modules`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  const mods = (await res.json()) as ModuleManifest[];
  return mods
    .filter((m) => m.feRemote != null && m.enabled !== false)
    .map((m) => ({ id: m.id, entry: remoteEntryUrl(apiBase(), m.id) }));
}

const loadedRemotes = new Set<string>();
let sharedReady: Promise<void> | null = null;

/** The seams a test replaces: how the shared map is built, how an entry is imported. */
export interface RemoteLoaders {
  provideShared: () => Promise<Record<string, unknown>>;
  importRemote: (entry: string) => Promise<{ default?: KromaModule }>;
}

const DEFAULT_LOADERS: RemoteLoaders = {
  provideShared,
  importRemote: (entry) => import(/* @vite-ignore */ entry),
};

function ensureShared(loaders: RemoteLoaders): Promise<void> {
  sharedReady ??= loaders
    .provideShared()
    .then((shared) => {
      (globalThis as Record<string, unknown>)[SHARED_GLOBAL] = shared;
    })
    .catch((e) => {
      sharedReady = null;
      throw e;
    });
  return sharedReady;
}

async function fetchRemote(spec: RemoteSpec, loaders: RemoteLoaders): Promise<KromaModule | null> {
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

function unmet(registry: ModuleRegistry, m: KromaModule): string | null {
  return depEntries(m.dependencies).find(({ id }) => !registry.has(id))?.id ?? null;
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
    for (const m of kept) drop(m, `dependency cycle (${err instanceof Error ? err.message : err})`);
    return [];
  }
  return [...kept].map((m) => m.id);
}

/** Load any not-yet-loaded frontend remotes into `registry` and return the ids
 *  newly registered. Re-callable, best-effort, and a no-op during SSR. */
export async function loadRuntimeRemotes(
  registry: ModuleRegistry,
  loaders: RemoteLoaders = DEFAULT_LOADERS,
): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  let specs: RemoteSpec[];
  try {
    specs = await discoverRemotes();
  } catch (e) {
    console.warn('[modules] remote discovery failed', e);
    return [];
  }
  const fresh = specs.filter((s) => !loadedRemotes.has(s.id));
  if (fresh.length === 0) return [];
  try {
    await ensureShared(loaders);
  } catch (e) {
    console.warn('[modules] shared modules failed to load', e);
    return [];
  }
  const loaded = await Promise.all(fresh.map((s) => fetchRemote(s, loaders)));
  return settle(
    registry,
    loaded.filter((m): m is KromaModule => m !== null),
  );
}

/** Whether this module's frontend was loaded as a runtime remote. */
export function isLoadedRemote(id: string): boolean {
  return loadedRemotes.has(id);
}

/** Forget a remote so a later reinstall re-loads it; the already-loaded code
 *  stays in memory. */
export function forgetRemote(id: string): void {
  loadedRemotes.delete(id);
}
