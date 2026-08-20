import type { CDPSession } from 'playwright';

export interface TraceEvent {
  name: string;
  ph: string;
  ts?: number;
  dur?: number;
  args?: { data?: { type?: string } };
}

// The worst task's window, in trace microseconds. A long task IS the stutter -
// the frame the eye sees - so it deserves attribution rather than a number.
export function longestTaskWindow(events: TraceEvent[]): { start: number; end: number } | null {
  let best: TraceEvent | null = null;
  for (const e of events) {
    if (e.ph !== 'X' || e.name !== 'RunTask' || e.dur == null || e.ts == null) continue;
    if (!best || e.dur > (best.dur ?? 0)) best = e;
  }
  if (!best?.ts || !best.dur) return null;
  return { start: best.ts, end: best.ts + best.dur };
}

// What the Performance panel calls the summary: how long the main thread spent
// in each kind of work, plus the long tasks that are the visible stutters.
export function traceSummary(events: TraceEvent[]): Record<string, number> {
  const KINDS = new Set([
    'RunTask',
    'FunctionCall',
    'UpdateLayoutTree', // "Recalculate Style"
    'Layout',
    'Paint',
    'UpdateLayerTree',
    'CompositeLayers',
    'ParseHTML',
    'GCEvent',
    'MajorGC',
    'MinorGC',
  ]);
  const out: Record<string, number> = {};
  let longTasks = 0;
  let longest = 0;
  for (const e of events) {
    if (e.ph !== 'X' || e.dur == null) continue;
    if (e.name === 'RunTask') {
      const ms = e.dur / 1000;
      if (ms >= 50) longTasks += 1;
      longest = Math.max(longest, ms);
    }
    if (KINDS.has(e.name)) out[e.name] = Math.round((out[e.name] ?? 0) + e.dur / 1000);
  }
  out.longTasks = longTasks;
  out.longestTaskMs = Math.round(longest);
  return out;
}

// Collect the tracing stream the Tracing domain emits after `Tracing.end`.
export function collectTrace(cdp: CDPSession): { events: Promise<TraceEvent[]> } {
  const chunks: TraceEvent[] = [];
  let settle: (v: TraceEvent[]) => void = () => {};
  const events = new Promise<TraceEvent[]>((resolve) => {
    settle = resolve;
  });
  cdp.on('Tracing.dataCollected', (e) => {
    chunks.push(...((e as { value: TraceEvent[] }).value ?? []));
  });
  cdp.on('Tracing.tracingComplete', () => settle(chunks));
  return { events };
}
