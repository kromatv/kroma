import type { RequestContext } from '../../core/client';
import type { DeviceId } from '../../core/ids';
import { type CrashReport, Screen, ScreenRoster } from './schemas';

/** Opt-in crash reporting: post an uncaught client crash to the diagnostics
 * sink, which the server keeps in a bounded ring readable by admins.
 * Best-effort; the caller (an error boundary) swallows any rejection. */
export default function diagnosticsApi(ctx: RequestContext) {
  return {
    crash: (report: CrashReport) => ctx.post('/diagnostics/crash', { body: report }),

    /** The live screens signed in as the caller (an admin), each one able to
     * say what it shows. */
    screens: async () => (await ctx.get('/admin/diagnostics/screens', ScreenRoster)).screens,

    /** Asks one of the caller's screens what it shows. Throws `KromaApiError`
     * 404 for a screen that is not the caller's or not live, 429 while too many
     * requests are open, and 504 when the screen did not answer in 5 seconds. */
    readScreen: (screenId: DeviceId) =>
      ctx.post('/admin/diagnostics/screens/:screenId', Screen, { params: { screenId } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    diagnostics: ReturnType<typeof diagnosticsApi>;
  }
}
