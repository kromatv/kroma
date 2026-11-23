import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { PerfOverview, PerfPlan, PerfSlowRequest, type PerfWindow } from './schemas';

const SlowList = z.object({ requests: z.array(PerfSlowRequest) });
const Switched = z.object({ enabled: z.boolean() });

/** What the server's profiler measured: routes, jobs, statements and spans, and
 * the slow requests with their waterfalls. */
export default function performanceApi(ctx: RequestContext) {
  return {
    overview: (window: PerfWindow) =>
      ctx.get('/admin/performance', PerfOverview, { query: { window } }),

    /** Newest first, waterfalls left out. */
    slow: (window: PerfWindow) =>
      ctx.get('/admin/performance/slow', SlowList, { query: { window } }),

    slowRequest: (id: string) =>
      ctx.get('/admin/performance/slow/:id', PerfSlowRequest, { params: { id } }),

    /** Only a statement of the core database has one. */
    plan: (key: string) =>
      ctx.get('/admin/performance/segments/:key/plan', PerfPlan, { params: { key } }),

    /** One JSON record per line, opened by a `meta` record that explains them. */
    export: (window: PerfWindow) => ctx.blob('/admin/performance/export', { query: { window } }),

    setEnabled: (enabled: boolean) =>
      ctx.put('/admin/performance/enabled', Switched, { body: { enabled } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    performance: ReturnType<typeof performanceApi>;
  }
}
