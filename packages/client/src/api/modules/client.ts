import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { ModuleInfo } from './schemas';
import type modulesUrls from './urls';

const Relayed = z.array(z.unknown()).transform((entries) =>
  entries.flatMap((entry) => {
    const parsed = ModuleInfo.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }),
);

/** The module registry. */
export default function modulesApi(ctx: RequestContext) {
  return {
    /** Modules on this server with their enabled flag + capabilities; drives the
     * admin console's data-driven ADD flows. */
    list: () => ctx.get('/modules', Relayed),
  };
}

declare module '../../core/client' {
  interface Domains {
    modules: ReturnType<typeof modulesApi> & ReturnType<typeof modulesUrls>;
  }
}
