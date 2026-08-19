// The frontend module registry: the host-side mirror of the Rust `Registry`.

import type { HostBase, KromaHost } from './host';
import type {
  AnySlotContribution,
  KromaModule,
  NavItem,
  RouteDef,
  SettingsPanel,
  SlotName,
} from './module';
import type { Dependencies, ModuleManifest } from './types';

/** A `{ id: range }` dependency map as a flat list; `"*"` means no constraint. */
export function depEntries(deps?: Dependencies | null): { id: string; version?: string }[] {
  if (!deps) return [];
  return Object.entries(deps).map(([id, range]) => ({
    id,
    version: range && range !== '*' ? range : undefined,
  }));
}

export type ModuleRoute = RouteDef & { moduleId: string };

export type ModuleNav = NavItem & { moduleId: string };

export type ModulePanel = SettingsPanel & { moduleId: string };

export type ModuleSlotEntry = AnySlotContribution & { moduleId: string };

export interface ModuleStatus {
  id: string;
  frontend: true;
  backend: boolean;
  manifest?: ModuleManifest;
}

export class ModuleRegistry {
  private readonly modules = new Map<string, KromaModule>();
  private readonly setupDone = new Set<string>();

  register(module: KromaModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`module "${module.id}" registered twice`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  /** Remove a module, e.g. to roll back a runtime remote whose deps don't
   *  resolve before it breaks `order()` for everyone else. */
  unregister(id: string): void {
    this.modules.delete(id);
    this.setupDone.delete(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  ids(): string[] {
    return [...this.modules.keys()];
  }

  /** A module's own message catalogs (locale -> key -> string), if it ships any. */
  localesOf(id: string): Record<string, Record<string, string>> | undefined {
    return this.modules.get(id)?.locales;
  }

  /** Modules in initialization order (dependencies first). Throws on a missing
   *  hard dependency or a cycle; version ranges are the backend's business. */
  order(): KromaModule[] {
    const mods = [...this.modules.values()];
    const edgesOf = (m: KromaModule): string[] => {
      const ids: string[] = [];
      for (const { id } of depEntries(m.dependencies)) {
        if (!this.modules.has(id)) {
          throw new Error(`module "${m.id}" depends on "${id}", which is not registered`);
        }
        ids.push(id);
      }
      for (const { id } of depEntries(m.optionalDependencies)) {
        if (this.modules.has(id)) ids.push(id);
      }
      return ids;
    };

    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const m of mods) indegree.set(m.id, 0);
    for (const m of mods) {
      for (const dep of edgesOf(m)) {
        indegree.set(m.id, (indegree.get(m.id) ?? 0) + 1);
        const list = dependents.get(dep) ?? [];
        list.push(m.id);
        dependents.set(dep, list);
      }
    }

    const queue = mods.filter((m) => (indegree.get(m.id) ?? 0) === 0).map((m) => m.id);
    const orderedIds: string[] = [];
    // The for-of iterator keeps up with `queue.push` below, so newly unblocked
    // ids are visited in the same pass (Kahn's topological sort).
    for (const id of queue) {
      orderedIds.push(id);
      for (const dependent of dependents.get(id) ?? []) {
        const next = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, next);
        if (next === 0) queue.push(dependent);
      }
    }

    if (orderedIds.length !== mods.length) {
      const stuck = mods.map((m) => m.id).filter((id) => !orderedIds.includes(id));
      throw new Error(`module dependency cycle among [${stuck.join(', ')}]`);
    }
    return orderedIds.map((id) => this.modules.get(id)).filter((m): m is KromaModule => m != null);
  }

  /** Resolve the graph, compute each module's exports and run its setup in
   *  dependency order, then return the wired host. Ids in `skipSetup` are not
   *  set up, and a module's setup runs at most once across calls. */
  async start(base: HostBase, skipSetup?: ReadonlySet<string>): Promise<KromaHost> {
    const exports = new Map<string, unknown>();
    const host: KromaHost = {
      ...base,
      getModuleApi: (id) => exports.get(id as string) as never,
    };
    for (const module of this.order()) {
      if (module.exports) exports.set(module.id, module.exports(host));
      if (skipSetup?.has(module.id) || this.setupDone.has(module.id)) continue;
      await module.setup?.(host);
      this.setupDone.add(module.id);
    }
    return host;
  }

  navItems(): ModuleNav[] {
    return this.order().flatMap((m) => (m.navItems ?? []).map((n) => ({ ...n, moduleId: m.id })));
  }

  routes(): ModuleRoute[] {
    // Route paths are the URL under /m/, so they must be unique across modules:
    // keep the first registrant rather than silently shadowing a page.
    const out: ModuleRoute[] = [];
    const owner = new Map<string, string>();
    for (const m of this.order()) {
      for (const r of m.routes ?? []) {
        const taken = owner.get(r.path);
        if (taken) {
          console.warn(
            `[modules] route path "${r.path}" from "${m.id}" collides with "${taken}"; ignoring the duplicate`,
          );
          continue;
        }
        owner.set(r.path, m.id);
        out.push({ ...r, moduleId: m.id });
      }
    }
    return out;
  }

  /** Everything registered for one slot, in `order` then dependency order. The
   *  caller decides whether a module is ENABLED: this registry only knows what
   *  was registered. */
  slotsFor(slot: SlotName): ModuleSlotEntry[] {
    return this.order()
      .flatMap((m) => (m.slots ?? []).map((s) => ({ ...s, moduleId: m.id })))
      .filter((s) => s.slot === slot)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  settingsPanels(): ModulePanel[] {
    return this.order().flatMap((m) =>
      (m.settingsPanels ?? []).map((p) => ({ ...p, moduleId: m.id })),
    );
  }

  /** Cross-check registered frontend modules against the backend manifest: an
   *  id absent from `/api/modules` comes back `backend: false`. */
  reconcile(manifest: ModuleManifest[]): ModuleStatus[] {
    const backend = new Map(manifest.map((m) => [m.id, m]));
    return [...this.modules.values()].map((m) => ({
      id: m.id,
      frontend: true as const,
      backend: backend.has(m.id),
      manifest: backend.get(m.id),
    }));
  }
}
