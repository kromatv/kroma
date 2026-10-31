import type { KromaClient } from '@kromatv/client';
import {
  depEntries,
  type KromaModule,
  type ModuleManifest,
  type ModuleRegistry,
  remoteEntryUrl,
  remoteSharedUrl,
} from '@kromatv/module-sdk';
import { queryOptions } from '@tanstack/react-query';
import { apiBase } from '#web/shared/lib/api';
import { EntryReads, installShared, provideEntryShared, provideShared } from './shared-scope';

interface RemoteSpec {
  id: string;
  entry: string;
  reads: string;
}

const MAX_DECLARATION_BYTES = 64 * 1024;

/** The installed modules, as `GET /api/modules` lists them. */
export async function fetchModules(client?: KromaClient): Promise<ModuleManifest[]> {
  const res = await fetch(`${apiBase()}/api/modules`, {
    headers: client?.authHeaders() ?? {},
  });
  if (!res.ok) throw new Error(`GET /api/modules failed (${res.status})`);
  return (await res.json()) as ModuleManifest[];
}

/** One cache entry for the module list, so the remote loader, the host and the
 *  nav read a single response per boot. */
export const modulesQuery = (client?: KromaClient) =>
  queryOptions({
    queryKey: ['modules'],
    queryFn: () => fetchModules(client),
    staleTime: 60_000,
  });

function remotesOf(listed: readonly ModuleManifest[]): RemoteSpec[] {
  return listed
    .filter((m) => m.feRemote != null && m.enabled !== false)
    .map((m) => ({
      id: m.id,
      entry: remoteEntryUrl(apiBase(), m.id),
      reads: remoteSharedUrl(apiBase(), m.id),
    }));
}

async function readDeclaration(url: string): Promise<EntryReads | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_DECLARATION_BYTES) return null;
    const parsed = EntryReads.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The seams a test replaces: how the shared map is built, how an entry is imported. */
export interface RemoteLoaders {
  provideShared: () => Promise<Record<string, unknown>>;
  provideEntryShared: (reads: readonly EntryReads[]) => Promise<Record<string, unknown>>;
  readDeclaration: (url: string) => Promise<EntryReads | null>;
  importRemote: (entry: string) => Promise<{ default?: KromaModule }>;
}

const DEFAULT_LOADERS: RemoteLoaders = {
  provideShared,
  provideEntryShared,
  readDeclaration,
  importRemote: (entry) => import(/* @vite-ignore */ entry),
};

function unmet(registry: ModuleRegistry, m: KromaModule): string | null {
  return depEntries(m.dependencies).find(({ id }) => !registry.has(id))?.id ?? null;
}

/** Remote loading state belongs to one mounted module host. */
export function createRuntimeRemotes(
  client?: KromaClient,
  listModules: () => Promise<ModuleManifest[]> = () => fetchModules(client),
) {
  const loadedRemotes = new Set<string>();
  let loaders = DEFAULT_LOADERS;
  let sharedReady: Promise<void> | null = null;
  let gate: Promise<void> | null = null;

  let disposed = false;
  function ensureShared(): Promise<void> {
    sharedReady ??= loaders
      .provideShared()
      .then((shared) => installShared(shared, true))
      .catch((e) => {
        sharedReady = null;
        throw e;
      });
    return sharedReady;
  }

  /** Settles once every shared module is on the global, loading them on the
   *  first call, and returns the same promise every call after. It never
   *  rejects: a module page that still cannot load fails on its own import. */
  function ready(): Promise<void> {
    gate ??= ensureShared().catch((e) => {
      console.warn('[modules] shared modules failed to load', e);
    });
    return gate;
  }

  async function provideFor(specs: readonly RemoteSpec[]): Promise<void> {
    if (sharedReady) return sharedReady;
    const reads = await Promise.all(specs.map((s) => loaders.readDeclaration(s.reads)));
    const declared = reads.filter((r): r is EntryReads => r !== null);
    if (declared.length < reads.length) return ensureShared();
    installShared(await loaders.provideEntryShared(declared), false);
  }

  async function fetchRemote(spec: RemoteSpec): Promise<KromaModule | null> {
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
   *  newly registered. Each entry is handed only what it declared it reads as it
   *  loads; a module that runs code at start (`setup`, `exports`) gets the full
   *  set first. Re-callable, best-effort, and a no-op during SSR. */
  async function loadRuntimeRemotes(
    registry: ModuleRegistry,
    given?: RemoteLoaders,
  ): Promise<string[]> {
    if (given) loaders = given;
    if (disposed || typeof window === 'undefined') return [];
    let specs: RemoteSpec[];
    try {
      specs = remotesOf(await listModules());
    } catch (e) {
      console.warn('[modules] remote discovery failed', e);
      return [];
    }
    if (disposed) return [];
    const fresh = specs.filter((s) => !loadedRemotes.has(s.id));
    if (fresh.length === 0) return [];
    try {
      await provideFor(fresh);
    } catch (e) {
      console.warn('[modules] shared modules failed to load', e);
      return [];
    }
    if (disposed) return [];
    const loaded = (await Promise.all(fresh.map(fetchRemote))).filter(
      (m): m is KromaModule => m !== null,
    );
    if (loaded.some((m) => m.setup || m.exports)) await ready();
    if (disposed) return [];
    return settle(registry, loaded);
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
    ready,
    isLoadedRemote,
    forgetRemote,
    dispose() {
      disposed = true;
      loadedRemotes.clear();
    },
  };
}
