import type { RequestContext } from '../../core/client';
import { Licenses } from './schemas';

/** The third-party licenses of the server's build. */
export default function licensesApi(ctx: RequestContext) {
  return {
    list: () => ctx.get('/licenses', Licenses),
  };
}

declare module '../../core/client' {
  interface Domains {
    licenses: ReturnType<typeof licensesApi>;
  }
}
