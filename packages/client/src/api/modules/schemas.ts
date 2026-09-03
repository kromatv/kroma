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

/** One module from `GET /api/modules`: its manifest identity, admin `enabled`
 * flag (default true), and the points it answers. */
export const ModuleInfo = z.object({
  id: ModuleId,
  name: z.string(),
  enabled: z.boolean().optional(),
  contributes: z.array(EngineContribution).optional(),
});
export type ModuleInfo = z.infer<typeof ModuleInfo>;
