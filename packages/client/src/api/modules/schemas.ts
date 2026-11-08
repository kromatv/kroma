import { z } from 'zod';
import { ModuleId } from './ids';

/** One field in an engine's add-form (mirrors the Rust `ConfigField`, whose
 * `type` is a free string: a kind this build does not know renders as text). */
export const EngineField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'bool', 'number', 'select']).catch('string'),
  default: z.string().optional().catch(undefined),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  secret: z.boolean().optional(),
  required: z.boolean().optional(),
});
export type EngineField = z.infer<typeof EngineField>;

/** One thing a module contributes: it answers `point`, under `id` when several
 * contributions to that point can be live at once. A contribution with an
 * add-flow also carries a display `label` plus either `fields` (a plain form) or
 * a custom `flow` discriminator the host page renders itself. */
export const EngineContribution = z.object({
  point: z.string(),
  id: z.string().optional(),
  label: z.string().optional(),
  fields: z.array(EngineField).optional(),
  flow: z.string().optional(),
});
export type EngineContribution = z.infer<typeof EngineContribution>;

/** What a module's frontend entry, and every chunk it imports statically, reads
 * from the host as it evaluates, as `{ [specifier]: names }`. */
export const EntryReads = z.record(z.string().max(256), z.array(z.string().max(256)).max(1024));
export type EntryReads = z.infer<typeof EntryReads>;

/** A module's frontend as its installed bundle carries it. `revision` moves with
 * every byte under the bundle's `fe/`, so a URL that carries it never goes
 * stale. `shared` is absent when the build declared nothing, and the host then
 * hands the entry every shared module. */
export const ModuleFrontend = z.object({
  revision: z.string().regex(/^[0-9a-f]{8,64}$/),
  shared: EntryReads.optional(),
});
export type ModuleFrontend = z.infer<typeof ModuleFrontend>;

/** One module from `GET /api/modules`: its manifest identity, admin `enabled`
 * flag (default true), the points it answers, and its frontend when the
 * installed bundle carries one. A server that predates `frontend` names only
 * `feRemote`, the manifest's claim that there is one. */
export const ModuleInfo = z.object({
  id: ModuleId,
  name: z.string(),
  enabled: z.boolean().optional(),
  contributes: z.array(EngineContribution).optional(),
  feRemote: z.object({ module: z.string() }).optional().catch(undefined),
  frontend: ModuleFrontend.optional().catch(undefined),
});
export type ModuleInfo = z.infer<typeof ModuleInfo>;
