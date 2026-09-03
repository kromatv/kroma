import { z } from 'zod';
import { JobKey, JobRunId } from './ids';

/** Which part of the system a scheduled job belongs to. */
export const Category = z.enum([
  'maintenance',
  'library',
  'recommendations',
  'pipeline',
  'acquisition',
]);
export type Category = z.infer<typeof Category>;

/** One recorded execution of a job. */
export const JobRun = z.object({
  id: JobRunId,
  jobKey: JobKey,
  trigger: z.string(),
  status: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  durationMs: z.number().nullable(),
  progressDone: z.number().nullable(),
  progressTotal: z.number().nullable(),
  error: z.string().nullable(),
});
export type JobRun = z.infer<typeof JobRun>;

/** A job's definition + current state, as listed in the admin console. */
export const JobInfo = z.object({
  key: JobKey,
  name: z.string(),
  description: z.string(),
  category: Category,
  schedule: z.string().nullable(),
  defaultSchedule: z.string().nullable(),
  customized: z.boolean(),
  enabled: z.boolean(),
  running: z.boolean(),
  runId: JobRunId.nullable(),
  progressDone: z.number().nullable(),
  progressTotal: z.number().nullable(),
  nextRunAt: z.number().nullable(),
  lastRun: JobRun.nullable(),
});
export type JobInfo = z.infer<typeof JobInfo>;

/** `PATCH /api/admin/jobs/:key` body. A `null` schedule clears it. */
export const JobPatch = JobInfo.pick({ schedule: true, enabled: true }).exactPartial();
export type JobPatch = z.infer<typeof JobPatch>;

/** One persisted log line of a run. */
export const JobLog = z.object({
  ts: z.number(),
  level: z.string(),
  message: z.string(),
});
export type JobLog = z.infer<typeof JobLog>;

/** `GET /api/admin/jobs/:key` a job plus its recent run history. */
export const JobDetail = z.object({
  info: JobInfo,
  runs: z.array(JobRun),
});
export type JobDetail = z.infer<typeof JobDetail>;

/** What every "start this now" endpoint answers: the run it queued. */
export const JobStarted = z.object({ runId: JobRunId });
export type JobStarted = z.infer<typeof JobStarted>;

/** What every "stop this" endpoint answers. */
export const JobCancelled = z.object({ cancelled: z.boolean() });
export type JobCancelled = z.infer<typeof JobCancelled>;

/** `GET /api/admin/jobs`. */
export const JobsView = z.object({ jobs: z.array(JobInfo) });
export type JobsView = z.infer<typeof JobsView>;
