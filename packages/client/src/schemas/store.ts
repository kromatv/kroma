// Runtime schemas for the admin module Store (`/api/admin/store/*`): the merged
// registry catalog enriched with this server's verdict, install plans and
// reports, registry rows, and the `module.op.*` progress frames streamed over
// `/api/events`. The server hand-builds these responses (no ts-rs), so there is
// no drift guard: the zod parse at the trust boundary IS the check.

import { Contribution, PointReq } from '@kroma/registry';
import { z } from 'zod';

/** A `{ id: range }` dependency map, the one shape a dependency has anywhere:
 * in a manifest, in a registry record, and here. */
const DependencyMap = z.record(z.string(), z.string());

/** One catalog entry, enriched server-side (`GET /api/admin/store/catalog`):
 * the picked artifact for this platform, installed/update state, and the
 * compatibility verdict with its reason. */
export const StoreModule = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  library: z.boolean(),
  icon: z.string().nullish(),
  engines: z.record(z.string(), z.string()).default({}),
  dependencies: DependencyMap,
  optionalDependencies: DependencyMap,
  contributes: z.array(Contribution),
  consumes: z.array(PointReq),
  target: z.string().nullish(),
  url: z.string().nullish(),
  size: z.number().nullish(),
  sha256: z.string().nullish(),
  installedVersion: z.string().nullish(),
  updateAvailable: z.boolean(),
  compatible: z.boolean(),
  reason: z.string().nullish(),
  /** Name of the registry this entry came from. */
  source: z.string(),
});
export type StoreModule = z.infer<typeof StoreModule>;

/** One registry row: the stored entry merged with its fetch outcome (`skipped`
 * carries why a row was not consulted; `shadowed` the ids a higher-priority
 * registry already claimed). */
export const StoreRegistry = z.object({
  name: z.string(),
  url: z.string(),
  official: z.boolean(),
  enabled: z.boolean(),
  skipped: z.string().nullish(),
  error: z.string().nullish(),
  moduleCount: z.number(),
  shadowed: z.array(z.string()),
});
export type StoreRegistry = z.infer<typeof StoreRegistry>;

/** `GET /api/admin/store/catalog`, merged across every configured registry.
 * `registryUrl` and the top-level `error` describe the OFFICIAL registry only
 * (legacy shape); `registries` carries every row. */
export const StoreCatalog = z.object({
  schema: z.number(),
  serverVersion: z.string(),
  target: z.string(),
  registryUrl: z.string(),
  error: z.string().nullish(),
  registries: z.array(StoreRegistry),
  modules: z.array(StoreModule),
});
export type StoreCatalog = z.infer<typeof StoreCatalog>;

/** One resolved row of an install plan, dependencies first. `requested` is
 * false for a module that rides along as a dependency. */
export const StorePlanModule = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  size: z.number().nullish(),
  installedVersion: z.string().nullish(),
  requested: z.boolean(),
});
export type StorePlanModule = z.infer<typeof StorePlanModule>;

/** A compatible, not-yet-installed opt-in the install dialog offers: a
 * declared optional dependency (`point` null), or a contributor to a point the
 * plan `consumes` and nothing answers (`point` = the one it would answer).
 * `for` names the module asking. */
export const StoreOptionalModule = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  size: z.number().nullish(),
  description: z.string().nullish(),
  point: z.string().nullish(),
  for: z.string().nullish(),
  /** True when this row is the only way to answer a consumed point; the dialog
   * pre-checks it. */
  suggested: z.boolean(),
});
export type StoreOptionalModule = z.infer<typeof StoreOptionalModule>;

/** A point no installed, planned or available module answers. */
export const StoreMissingPoint = z.object({
  point: z.string(),
  id: z.string().nullish(),
  for: z.string(),
});
export type StoreMissingPoint = z.infer<typeof StoreMissingPoint>;

/** `POST /api/admin/store/plan`: the dry-run behind the install dialog. */
export const StorePlan = z.object({
  requested: z.string(),
  modules: z.array(StorePlanModule),
  optional: z.array(StoreOptionalModule),
  missing: z.array(StoreMissingPoint),
  totalSize: z.number(),
});
export type StorePlan = z.infer<typeof StorePlan>;

/** `POST /api/admin/store/install-id`: everything actually installed, deps
 * included, in install order. `op` names the `module.op.*` stream that carried
 * this operation's progress. */
export const StoreInstallReport = z.object({
  op: z.string(),
  requested: z.string(),
  installed: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      version: z.string().nullish(),
    }),
  ),
});
export type StoreInstallReport = z.infer<typeof StoreInstallReport>;

/** `POST /api/admin/store/update`: the batch update outcome. */
export const StoreUpdateResult = z.object({
  updated: z.array(z.object({ id: z.string(), from: z.string(), to: z.string() })),
  failed: z.array(z.object({ id: z.string(), error: z.string() })),
});
export type StoreUpdateResult = z.infer<typeof StoreUpdateResult>;

/** `POST /api/admin/store/registry-preview`: what a candidate registry URL
 * serves, fetched before the row is saved. */
export const StoreRegistryPreview = z.object({
  ok: z.boolean(),
  error: z.string().nullish(),
  moduleCount: z.number(),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
      library: z.boolean(),
    }),
  ),
});
export type StoreRegistryPreview = z.infer<typeof StoreRegistryPreview>;

/** `POST /api/admin/modules/{id}/enabled`. `warning` reports a sidecar that
 * failed to start; the flag is set either way, the admin asked for it. */
export const ModuleEnabledResult = z.object({
  id: z.string(),
  enabled: z.boolean(),
  warning: z.string().nullish(),
});
export type ModuleEnabledResult = z.infer<typeof ModuleEnabledResult>;

/** `POST /api/admin/modules/{id}/restart`. `running` is what the supervisor
 * reports once the process is back up. */
export const ModuleRestartResult = z.object({
  restarted: z.boolean(),
  running: z.boolean(),
});
export type ModuleRestartResult = z.infer<typeof ModuleRestartResult>;

/** The structured `409 Conflict` body of `DELETE /api/admin/store/{id}`: who
 * still depends on the module, so the UI can offer an informed force. */
export const StoreUninstallConflict = z.object({
  error: z.string(),
  dependents: z.array(z.string()),
});
export type StoreUninstallConflict = z.infer<typeof StoreUninstallConflict>;

/** `module.op.*` frames the store operations stream over `/api/events`. Not
 * part of core's `ServerEvent` union (module vocabulary stays out of core); a
 * listener widens the socket: `new KromaEvents<ServerEvent | StoreOpEvent>()`. */
export type StoreOpEvent =
  | {
      type: 'module.op.started';
      op: string;
      kind: 'install' | 'update' | 'uninstall';
      requested: string;
      modules: {
        id: string;
        name?: string | null;
        version?: string | null;
        size?: number | null;
      }[];
    }
  | {
      type: 'module.op.progress';
      op: string;
      id: string;
      phase: 'download' | 'install';
      received?: number | null;
      total?: number | null;
    }
  | { type: 'module.op.done'; op: string; id: string; version: string }
  | { type: 'module.op.finished'; op: string; ok: boolean; error?: string | null }
  | { type: 'module.changed'; id: string; enabled?: boolean };
