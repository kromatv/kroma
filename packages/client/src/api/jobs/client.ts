import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import type { JobKey, JobRunId } from './ids';
import { JobCancelled, JobDetail, JobLog, type JobPatch, JobStarted, JobsView } from './schemas';

const RunLogs = z.object({ logs: z.array(JobLog) });

/** The scheduled jobs behind the admin console's Tâches screen. */
export default function jobsApi(ctx: RequestContext) {
  return {
    list: () => ctx.get('/admin/jobs', JobsView),
    detail: (key: JobKey) => ctx.get('/admin/jobs/:key', JobDetail, { params: { key } }),
    run: (key: JobKey) => ctx.post('/admin/jobs/:key/run', JobStarted, { params: { key } }),
    cancel: (key: JobKey) => ctx.post('/admin/jobs/:key/cancel', JobCancelled, { params: { key } }),
    update: (key: JobKey, patch: JobPatch) =>
      ctx.patch('/admin/jobs/:key', { params: { key }, body: patch }),
    runLogs: (runId: JobRunId) =>
      ctx.get('/admin/job-runs/:runId/logs', RunLogs, { params: { runId } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    jobs: ReturnType<typeof jobsApi>;
  }
}
