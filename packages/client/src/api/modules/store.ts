import {
  Contribution,
  Helpers,
  Permissions,
  PointReq,
  SettingsScope,
  Storage,
} from '@kromatv/registry';
import { z } from 'zod';
import { ModuleId } from './ids';

const DependencyMap = z.record(z.string(), z.string());

/** What a module declares it may do and reach, as its catalog row or its bundle
 *  says. Each part is null when the source does not say, or says something this
 *  client cannot read. */
export const DeclaredAccess = z.object({
  permissions: Permissions.nullish().catch(null),
  storage: Storage.nullish().catch(null),
  settings: SettingsScope.nullish().catch(null),
  helpers: Helpers.nullish().catch(null),
});
export type DeclaredAccess = z.infer<typeof DeclaredAccess>;

/** Why this server cannot take a catalog entry, for the client to word. */
export const StoreRefusal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('schema'), built: z.number(), speaks: z.number() }),
  z.object({ kind: z.literal('unknownEngine'), engine: z.string() }),
  z.object({
    kind: z.literal('engine'),
    engine: z.string(),
    range: z.string(),
    serverVersion: z.string(),
  }),
  z.object({ kind: z.literal('native') }),
]);
export type StoreRefusal = z.infer<typeof StoreRefusal>;

/** One catalog entry, enriched server-side (`GET /api/admin/store/catalog`):
 * the picked artifact, installed/update state, and the compatibility verdict
 * with its reason. */
export const StoreModule = DeclaredAccess.extend({
  id: ModuleId,
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
  url: z.string().nullish(),
  size: z.number().nullish(),
  sha256: z.string().nullish(),
  installedVersion: z.string().nullish(),
  updateAvailable: z.boolean(),
  updateBlocked: z.boolean().default(false),
  compatible: z.boolean(),
  reason: z.string().nullish(),
  refusal: StoreRefusal.nullish().catch(null),
  /** Name of the registry this entry came from. */
  source: z.string(),
  /** This update asks for more than the installed version, so an operator has
   * to accept it: no batch or automatic update takes it. */
  widensPermissions: z.boolean().default(false),
  official: z.boolean().default(false),
});
export type StoreModule = z.infer<typeof StoreModule>;

/** What a module may do, as its manifest declares it. */
export type ModulePermissions = NonNullable<StoreModule['permissions']>;

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
  registryUrl: z.string(),
  error: z.string().nullish(),
  registries: z.array(StoreRegistry),
  modules: z.array(StoreModule),
});
export type StoreCatalog = z.infer<typeof StoreCatalog>;

/** One resolved row of an install plan, dependencies first. `requested` is
 * false for a module that rides along as a dependency. */
export const StorePlanModule = DeclaredAccess.extend({
  id: ModuleId,
  name: z.string(),
  version: z.string(),
  size: z.number().nullish(),
  installedVersion: z.string().nullish(),
  requested: z.boolean(),
  widensPermissions: z.boolean().default(false),
  official: z.boolean().default(false),
});
export type StorePlanModule = z.infer<typeof StorePlanModule>;

/** A compatible, not-yet-installed opt-in the install dialog offers: a
 * declared optional dependency (`point` null), or a contributor to a point the
 * plan `consumes` and nothing answers (`point` = the one it would answer).
 * `for` names the module asking. */
export const StoreOptionalModule = z.object({
  id: ModuleId,
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
  /** Ids held back because the update asks for more than the installed version. */
  needsConsent: z.array(z.string()).default([]),
});
export type StoreUpdateResult = z.infer<typeof StoreUpdateResult>;

/** `POST /api/admin/store/inspect`: what a `.kmod` declares, read before it is
 * installed so an operator can accept it. */
export const StoreBundleInspection = DeclaredAccess.extend({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  installedVersion: z.string().nullish(),
  widensPermissions: z.boolean().default(false),
});
export type StoreBundleInspection = z.infer<typeof StoreBundleInspection>;

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

/** `POST /api/admin/modules/{id}/enabled`. `warning` reports a module that
 * failed to start; the flag is set either way, the admin asked for it. */
export const ModuleEnabledResult = z.object({
  id: ModuleId,
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
