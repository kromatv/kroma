import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { JobCancelled, JobStarted } from '../jobs';
import type { SubjectId } from '../media';
import {
  ElementProcessing,
  PipelineElements,
  PipelineTaskView,
  PipelineView,
  type SubjectKind,
} from './schemas';

const Requeued = z.object({ requeued: z.number() });
const FailedTasks = z.object({ tasks: z.array(PipelineTaskView) });
const Reprocessed = z.object({ subjects: z.number(), stages: z.array(z.string()) });

/** The processing pipeline: stage control, failed-task retries and the
 * per-element view the admin drills into. */
export default function pipelineApi(ctx: RequestContext) {
  return {
    overview: () => ctx.get('/admin/pipeline', PipelineView),

    /** Newest first. */
    failed: (stage: string) =>
      ctx.get('/admin/pipeline/:stage/failed', FailedTasks, { params: { stage } }),

    run: (stage: string) =>
      ctx.post('/admin/pipeline/:stage/run', JobStarted, { params: { stage } }),

    cancel: (stage: string) =>
      ctx.post('/admin/pipeline/:stage/cancel', JobCancelled, { params: { stage } }),

    /** Holds or releases every stage at once. */
    pause: (paused: boolean) =>
      ctx.post('/admin/pipeline/pause', z.object({ paused: z.boolean() }), { body: { paused } }),

    /** Resets a stage's failed tasks to pending. */
    retry: (stage: string) =>
      ctx.post('/admin/pipeline/:stage/retry', Requeued, { params: { stage } }),

    /** Puts every non-running task of a stage back to pending. */
    reprocess: (stage: string) =>
      ctx.post('/admin/pipeline/:stage/reprocess', Requeued, { params: { stage } }),

    retryTask: (stage: string, subjectId: SubjectId) =>
      ctx.post('/admin/pipeline/:stage/task/retry', Requeued, {
        params: { stage },
        body: { subjectId },
      }),

    /** Filtered, paginated elements with per-treatment status + full counts. */
    elements: (
      params: { status?: string; kind?: string; q?: string; page?: number; limit?: number } = {},
    ) => ctx.get('/admin/pipeline/elements', PipelineElements, { query: params }),

    retryElement: (kind: SubjectKind, id: SubjectId, stage: string) =>
      ctx.post('/admin/pipeline/element/retry', { body: { kind, id, stage } }),

    item: (id: SubjectId) =>
      ctx.get('/admin/pipeline/item/:id', ElementProcessing, { params: { id } }),

    /** Aggregated across the series' episodes. */
    show: (id: SubjectId) =>
      ctx.get('/admin/pipeline/show/:id', ElementProcessing, { params: { id } }),

    /** Clears the element's artifacts, requeues its tasks and kicks every stage. */
    reprocessSubject: (kind: SubjectKind, id: SubjectId) =>
      ctx.post('/admin/pipeline/subject/reprocess', Reprocessed, { body: { kind, id } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    pipeline: ReturnType<typeof pipelineApi>;
  }
}
