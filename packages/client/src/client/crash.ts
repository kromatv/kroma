// Opt-in crash reporting: post an uncaught client crash to the diagnostics sink.
// The server stores it in a bounded ring readable by admins. Best-effort; the
// caller (an error boundary) swallows any rejection.

import type { CrashReport } from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

export function reportCrash(ctx: RequestContext, report: CrashReport): Promise<void> {
  return ctx.json<void>('/diagnostics/crash', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(report),
  });
}
