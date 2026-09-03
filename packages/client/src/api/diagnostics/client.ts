import type { RequestContext } from '../../core/client';
import type { CrashReport } from './schemas';

/** Opt-in crash reporting: post an uncaught client crash to the diagnostics
 * sink, which the server keeps in a bounded ring readable by admins.
 * Best-effort; the caller (an error boundary) swallows any rejection. */
export default function diagnosticsApi(ctx: RequestContext) {
  return {
    crash: (report: CrashReport) => ctx.post('/diagnostics/crash', { body: report }),
  };
}

declare module '../../core/client' {
  interface Domains {
    diagnostics: ReturnType<typeof diagnosticsApi>;
  }
}
