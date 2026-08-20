// Runtime schemas for the module registry (`GET /api/modules`). Each running
// module reports its admin `enabled` flag and the capabilities it provides; an
// engine capability (`download-client`, `indexer-engine`, ...) carries the
// add-form schema the admin console renders, so the ADD flows are data-driven
// (disabling a module hides its add-UI; adding an engine needs no frontend
// change).
//
// The payload is a third-party module's own manifest, relayed by the server, so
// it is validated here rather than trusted. Mirrors `Capability` / `ConfigField`
// in the Rust `kroma-module-manifest` crate.

import { z } from 'zod';

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

/** One capability a module provides, as a (`kind`, `id`) pair. Engine capabilities
 * with an add-flow also carry a display `label` plus either `fields` (a plain form)
 * or a custom `flow` discriminator the host page renders itself. */
export const EngineCapability = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  fields: z.array(EngineField).optional(),
  flow: z.string().optional(),
});
export type EngineCapability = z.infer<typeof EngineCapability>;

/** One module from `GET /api/modules`: its manifest identity, admin `enabled` flag
 * (default true), and the capabilities it provides. */
export const ModuleInfo = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().optional(),
  provides: z.array(EngineCapability).optional(),
});
export type ModuleInfo = z.infer<typeof ModuleInfo>;
