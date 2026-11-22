import { z } from 'zod';

/** A stretch of history the profiler reports on. */
export const PerfWindow = z.enum(['1h', '24h', '7d', '30d']);
export type PerfWindow = z.infer<typeof PerfWindow>;

/** What a scope measures: one HTTP request, or one run of a background job. */
export const ScopeKind = z.enum(['request', 'job']);
export type ScopeKind = z.infer<typeof ScopeKind>;

const spread = {
  count: z.number(),
  totalMs: z.number(),
  meanMs: z.number(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  maxMs: z.number(),
};

const named = {
  key: z.string(),
  kind: z.string(),
  label: z.string(),
  origin: z.string().nullable(),
};

/** A segment named for a reader: a statement (`sql`, origin = database), an
 * instrumented function (`span`, origin = file:line) or a measured call. */
export const PerfSegmentName = z.object(named);
export type PerfSegmentName = z.infer<typeof PerfSegmentName>;

/** How often one call of a route runs a segment, and for how long. */
export const PerfPart = z.object({ ...named, perCall: z.number(), msPerCall: z.number() });
export type PerfPart = z.infer<typeof PerfPart>;

/** The segment one call ran most often, and how often. */
export const PerfRepeat = z.object({ ...named, count: z.number() });
export type PerfRepeat = z.infer<typeof PerfRepeat>;

/** A problem a row shows by its numbers. Kept a string so a flag a newer server
 * adds still reads. */
export const PerfFlag = z.string();
export type PerfFlag = z.infer<typeof PerfFlag>;

/** One request route or job over the window. */
export const PerfScopeRow = z.object({
  kind: ScopeKind,
  name: z.string(),
  ...spread,
  serverErrors: z.number(),
  clientErrors: z.number(),
  segmentsPerCall: z.number(),
  kinds: z.record(z.string(), z.object({ perCall: z.number(), msPerCall: z.number() })),
  maxSegments: z.number(),
  worstRepeat: PerfRepeat.nullable(),
  bytesPerCall: z.number().nullable(),
  parts: z.array(PerfPart),
  flags: z.array(PerfFlag),
});
export type PerfScopeRow = z.infer<typeof PerfScopeRow>;

/** One statement, span or measured call over the window, with who ran it. */
export const PerfSegmentRow = z.object({
  ...named,
  ...spread,
  rowsPerCall: z.number(),
  fullScanStepsPerCall: z.number(),
  vmStepsPerCall: z.number(),
  sorts: z.number(),
  autoIndexes: z.number(),
  callers: z.array(z.object({ name: z.string(), count: z.number() })),
  flags: z.array(PerfFlag),
});
export type PerfSegmentRow = z.infer<typeof PerfSegmentRow>;

/** `GET /api/admin/performance`: everything over one window, heaviest first. */
export const PerfOverview = z.object({
  window: PerfWindow,
  enabled: z.boolean(),
  switchable: z.boolean(),
  generatedAtMs: z.number(),
  requests: z.array(PerfScopeRow),
  jobs: z.array(PerfScopeRow),
  segments: z.array(PerfSegmentRow),
});
export type PerfOverview = z.infer<typeof PerfOverview>;

const kindTotals = z.record(z.string(), z.object({ count: z.number(), ms: z.number() }));

/** One segment of a slow request, placed on its timeline. */
export const PerfStep = z.object({
  ...named,
  offsetMs: z.number(),
  durationMs: z.number(),
  rows: z.number(),
});
export type PerfStep = z.infer<typeof PerfStep>;

/** A request slower than 250 ms, or repeating one segment 20 times. Listed, its
 * waterfall is empty. */
export const PerfSlowRequest = z.object({
  id: z.string(),
  atMs: z.number(),
  name: z.string(),
  status: z.number().nullable(),
  totalMs: z.number(),
  kinds: kindTotals,
  segments: z.number(),
  bytes: z.number().nullable(),
  repeats: z.array(PerfRepeat),
  droppedSteps: z.number(),
  waterfall: z.array(PerfStep),
});
export type PerfSlowRequest = z.infer<typeof PerfSlowRequest>;

/** A request or job still running. */
export const PerfLiveRow = z.object({
  id: z.string(),
  kind: ScopeKind,
  name: z.string(),
  elapsedMs: z.number(),
  segments: z.number(),
  kinds: kindTotals,
  last: PerfSegmentName.nullable(),
});
export type PerfLiveRow = z.infer<typeof PerfLiveRow>;

/** `EXPLAIN QUERY PLAN` of a core statement, or why there is none. */
export const PerfPlan = z.object({
  plan: z.array(z.object({ id: z.number(), parent: z.number(), detail: z.string() })).nullable(),
  error: z.string().nullable(),
});
export type PerfPlan = z.infer<typeof PerfPlan>;

/** The shape of an export file. */
export type PerfExportFormat = 'jsonl' | 'md';
