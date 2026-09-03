import { z } from 'zod';
import { EpStats } from '../admin';

/** One treatment applied to a catalog element, and whether it has been done. */
export const Treatment = z.object({
  key: z.string(),
  status: z.string(),
  error: z.string().nullish(),
});
export type Treatment = z.infer<typeof Treatment>;

/** Which half of the catalog a pipeline action is aimed at. */
export const SubjectKind = z.enum(['item', 'show']);
export type SubjectKind = z.infer<typeof SubjectKind>;

/** Health counters for one pipeline stage, aggregated from the ledger. */
export const StageStat = z.object({
  stage: z.string(),
  key: z.string(),
  subjectKind: z.string(),
  pending: z.number(),
  running: z.number(),
  done: z.number(),
  failed: z.number(),
  blocked: z.number(),
});
export type StageStat = z.infer<typeof StageStat>;

/** Status tally over ALL elements (unfiltered), for the filter chips + header. */
export const ElementCounts = z.object({
  total: z.number(),
  ok: z.number(),
  pending: z.number(),
  running: z.number(),
  failed: z.number(),
  film: z.number(),
  series: z.number(),
  episode: z.number(),
});
export type ElementCounts = z.infer<typeof ElementCounts>;

/** Every treatment that applies to an element + whether it has been done. */
export const ElementProcessing = z.object({ treatments: z.array(Treatment) });
export type ElementProcessing = z.infer<typeof ElementProcessing>;

/** One catalog element (film / series / episode) with per-treatment status. */
export const ElementRow = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  poster: z.string().nullable(),
  year: z.number().nullable(),
  genre: z.string().nullable(),
  durationMs: z.number().nullable(),
  seasonCount: z.number().nullable(),
  treatments: z.array(Treatment),
  overall: z.string(),
  epStats: EpStats.nullish(),
});
export type ElementRow = z.infer<typeof ElementRow>;

/** `GET /api/admin/pipeline/elements`: a filtered, paginated page of the catalog. */
export const PipelineElements = z.object({
  total: z.number(),
  page: z.number(),
  pages: z.number(),
  counts: ElementCounts,
  elements: z.array(ElementRow),
});
export type PipelineElements = z.infer<typeof PipelineElements>;

/** One failed (or otherwise notable) ledger row, for the stage drill-down. */
export const PipelineTaskView = z.object({
  stage: z.string(),
  subjectKind: z.string(),
  subjectId: z.string(),
  title: z.string(),
  status: z.string(),
  attempts: z.number(),
  error: z.string().nullable(),
  finishedAt: z.number().nullable(),
});
export type PipelineTaskView = z.infer<typeof PipelineTaskView>;

/** `GET /api/admin/pipeline`: every stage's health, in DAG order. */
export const PipelineView = z.object({
  stages: z.array(StageStat),
  paused: z.boolean(),
});
export type PipelineView = z.infer<typeof PipelineView>;
