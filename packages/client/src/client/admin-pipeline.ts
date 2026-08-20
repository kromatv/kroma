// The processing pipeline: stage control, failed-task retries and the
// per-element view the admin drills into.

import type { ElementProcessing, PipelineElements, PipelineTaskView, PipelineView } from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

export function adminPipeline(ctx: RequestContext): Promise<PipelineView> {
  return ctx.json<PipelineView>('/admin/pipeline');
}

/** Newest first. */
export function pipelineFailed(
  ctx: RequestContext,
  stage: string,
): Promise<{ tasks: PipelineTaskView[] }> {
  return ctx.json<{ tasks: PipelineTaskView[] }>(
    `/admin/pipeline/${encodeURIComponent(stage)}/failed`,
  );
}

export function runPipelineStage(ctx: RequestContext, stage: string): Promise<{ runId: string }> {
  return ctx.json<{ runId: string }>(`/admin/pipeline/${encodeURIComponent(stage)}/run`, {
    method: 'POST',
  });
}

export function cancelPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ cancelled: boolean }> {
  return ctx.json<{ cancelled: boolean }>(`/admin/pipeline/${encodeURIComponent(stage)}/cancel`, {
    method: 'POST',
  });
}

/** Holds or releases every stage at once. */
export function pausePipeline(ctx: RequestContext, paused: boolean): Promise<{ paused: boolean }> {
  return ctx.json<{ paused: boolean }>('/admin/pipeline/pause', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ paused }),
  });
}

/** Resets a stage's failed tasks to pending. */
export function retryPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/retry`, {
    method: 'POST',
  });
}

/** Puts every non-running task of a stage back to pending. */
export function reprocessPipelineStage(
  ctx: RequestContext,
  stage: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/reprocess`, {
    method: 'POST',
  });
}

export function retryPipelineTask(
  ctx: RequestContext,
  stage: string,
  subjectId: string,
): Promise<{ requeued: number }> {
  return ctx.json<{ requeued: number }>(`/admin/pipeline/${encodeURIComponent(stage)}/task/retry`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ subjectId }),
  });
}

/** Filtered, paginated elements with per-treatment status + full-catalog counts. */
export function pipelineElements(
  ctx: RequestContext,
  params: { status?: string; kind?: string; q?: string; page?: number; limit?: number } = {},
): Promise<PipelineElements> {
  const p = new URLSearchParams();
  if (params.status) p.set('status', params.status);
  if (params.kind) p.set('kind', params.kind);
  if (params.q) p.set('q', params.q);
  if (params.page != null) p.set('page', String(params.page));
  if (params.limit != null) p.set('limit', String(params.limit));
  const query = p.toString();
  const suffix = query ? `?${query}` : '';
  return ctx.json<PipelineElements>(`/admin/pipeline/elements${suffix}`);
}

export async function retryElementStage(
  ctx: RequestContext,
  kind: 'item' | 'show',
  id: string,
  stage: string,
): Promise<void> {
  await ctx.json<void>('/admin/pipeline/element/retry', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, id, stage }),
  });
}

export function itemProcessing(ctx: RequestContext, id: string): Promise<ElementProcessing> {
  return ctx.json<ElementProcessing>(`/admin/pipeline/item/${encodeURIComponent(id)}`);
}

/** Aggregated across the series' episodes. */
export function showProcessing(ctx: RequestContext, id: string): Promise<ElementProcessing> {
  return ctx.json<ElementProcessing>(`/admin/pipeline/show/${encodeURIComponent(id)}`);
}

/** Clears the element's artifacts, requeues its tasks and kicks every stage. */
export function reprocessSubject(
  ctx: RequestContext,
  kind: 'item' | 'show',
  id: string,
): Promise<{ subjects: number; stages: string[] }> {
  return ctx.json<{ subjects: number; stages: string[] }>('/admin/pipeline/subject/reprocess', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, id }),
  });
}
