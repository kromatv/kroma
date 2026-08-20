export interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}
export interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

// Self time per function, the Performance panel's "Bottom-Up" view. Frames are
// merged by name + script so the same function called from ten places reads as
// one line, which is what makes a regression obvious.
export function bottomUp(
  profile: CpuProfile,
  window?: { start: number; end: number } | null,
): { label: string; ms: number; pct: number }[] {
  const byNode = new Map<number, CpuProfileNode>();
  for (const n of profile.nodes) byNode.set(n.id, n);

  // Sample-accurate self time: each sample's delta belongs to the node it hit.
  // `timeDeltas` are gaps BETWEEN samples, so walking them also reconstructs each
  // sample's timestamp - which is what lets a window select part of the run.
  const self = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let at = profile.startTime;
  let counted = 0;
  for (let i = 0; i < samples.length; i += 1) {
    at += deltas[i] ?? 0;
    if (window && (at < window.start || at > window.end)) continue;
    const id = samples[i] as number;
    const ms = Math.max(0, (deltas[i] ?? 0) / 1000);
    self.set(id, (self.get(id) ?? 0) + ms);
    counted += ms;
  }
  const total = window
    ? Math.max(1, counted)
    : Math.max(1, profile.endTime - profile.startTime) / 1000;

  const merged = new Map<string, number>();
  for (const [id, ms] of self) {
    const node = byNode.get(id);
    if (!node) continue;
    const frame = node.callFrame;
    const where = frame.url ? frame.url.split('/').pop() : '';
    const name = frame.functionName || '(anonymous)';
    const label = where ? `${name}  ${where}:${frame.lineNumber + 1}` : name;
    merged.set(label, (merged.get(label) ?? 0) + ms);
  }

  return [...merged]
    .map(([label, ms]) => ({
      label,
      ms: Math.round(ms),
      pct: Math.round((ms / total) * 1000) / 10,
    }))
    .sort((a, b) => b.ms - a.ms);
}
