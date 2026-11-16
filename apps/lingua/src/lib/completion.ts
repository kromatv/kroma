import type { Progress, Stage, StateCounts } from '#site/lib/views';

/** How far along a language is: `percent` is floored, so only a finished language reads 100%. */
export function completion({ done, total }: Progress): {
  ratio: number;
  percent: number;
  complete: boolean;
} {
  if (total <= 0) {
    return { ratio: 1, percent: 100, complete: true };
  }
  const ratio = done / total;
  return { ratio, percent: Math.floor(ratio * 100), complete: done >= total };
}

/** How a progress bar is coloured: `complete`, `partial`, or `draft` for a language no reader is offered yet. */
export type ProgressTone = 'complete' | 'partial' | 'draft';

/** The tone of `progress` in a language at `stage`; a finished draft still reads complete. */
export function progressTone(progress: Progress, stage: Stage = 'stable'): ProgressTone {
  if (completion(progress).complete) {
    return 'complete';
  }
  return stage === 'draft' ? 'draft' : 'partial';
}

/** The number in a form people read in English, grouped by thousands. */
export function grouped(count: number): string {
  return count.toLocaleString('en-US');
}

/** What is left to do in `states`, in words: `3 missing · 1 outdated`, or null when nothing is. */
export function workSummary(states: StateCounts): string | null {
  const parts = (['missing', 'outdated', 'unreviewed'] as const)
    .filter((state) => states[state] > 0)
    .map((state) => `${grouped(states[state])} ${state}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
