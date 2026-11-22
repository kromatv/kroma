import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import {
  type PerfExportFormat,
  PerfLiveRow,
  PerfOverview,
  PerfPlan,
  PerfSlowRequest,
  type PerfWindow,
} from './schemas';

const SlowList = z.object({ requests: z.array(PerfSlowRequest) });
const Running = z.object({ running: z.array(PerfLiveRow) });
const Switched = z.object({ enabled: z.boolean() });

/** What the server's profiler measured: routes, jobs, statements and spans, the
 * slow requests with their waterfalls, and what runs right now. */
export default function performanceApi(ctx: RequestContext) {
  return {
    overview: (window: PerfWindow) =>
      ctx.get('/admin/performance', PerfOverview, { query: { window } }),

    /** Newest first, waterfalls left out. */
    slow: (window: PerfWindow) =>
      ctx.get('/admin/performance/slow', SlowList, { query: { window } }),

    slowRequest: (id: string) =>
      ctx.get('/admin/performance/slow/:id', PerfSlowRequest, { params: { id } }),

    live: () => ctx.get('/admin/performance/live', Running),

    /** Only a statement of the core database has one. */
    plan: (key: string) =>
      ctx.get('/admin/performance/segments/:key/plan', PerfPlan, { params: { key } }),

    /** One record per line (`jsonl`), or a ranked summary (`md`). */
    export: (window: PerfWindow, format: PerfExportFormat) =>
      ctx.blob('/admin/performance/export', { query: { window, format } }),

    setEnabled: (enabled: boolean) =>
      ctx.put('/admin/performance/enabled', Switched, { body: { enabled } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    performance: ReturnType<typeof performanceApi>;
  }
}
