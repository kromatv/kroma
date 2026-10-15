import type { RequestContext } from '../../core/client';
import { type Capabilities, CapabilityView } from './schemas';

export default function capabilitiesApi(ctx: RequestContext) {
  return {
    read: async (): Promise<Capabilities> =>
      (await ctx.get('/capabilities', CapabilityView)).capabilities,
  };
}

declare module '../../core/client' {
  interface Domains {
    capabilities: ReturnType<typeof capabilitiesApi>;
  }
}
