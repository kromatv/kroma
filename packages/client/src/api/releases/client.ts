import type { RequestContext } from '../../core/client';
import { ReleasesView } from './schemas';

/** Release notes, in the signed-in reader's language. */
export default function releasesApi(ctx: RequestContext) {
  return {
    list: () => ctx.get('/releases', ReleasesView),
    /** Records that the reader was shown `version`, so `unseen` stops naming it. */
    markSeen: (version: string) => ctx.post('/releases/seen', { body: { version } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    releases: ReturnType<typeof releasesApi>;
  }
}
