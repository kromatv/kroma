// The module registry (`GET /api/modules`): every module running on the server,
// each tagged with its admin `enabled` flag and the capabilities it provides. The
// admin console reads this to render engine add-flows data-driven, so disabling a
// module hides its add-UI and adding an engine needs no frontend change.

import { z } from 'zod';
import { ModuleInfo } from '../schemas';
import type { RequestContext } from './base';

/** Every module the server reports, with its enabled flag + provided capabilities
 * (each engine capability carries its add-form schema). Validated: what it relays
 * is a third-party module's own manifest, so an entry that fails the schema is
 * dropped rather than failing the whole list. */
export async function listModules(ctx: RequestContext): Promise<ModuleInfo[]> {
  const relayed = z.array(z.unknown()).parse(await ctx.json('/modules'));
  return relayed.flatMap((entry) => {
    const parsed = ModuleInfo.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
