import type { Frames } from './read';
import type { Reading } from './reading';

export interface Check {
  name: string;
  reads: string;
  ok: boolean;
}

interface Run {
  atRest: Reading;
  walked: Reading;
  frames: Frames | null;
  console: readonly string[];
  growth: number;
  minFps: number;
}

const RINGS_EXPECTED = 1;
const RINGS_NAMED = 6;

function overlapCheck(when: string, seen: Reading): Check {
  const ok = seen.overlaps === 0;
  return {
    name: `layout ${when}`,
    reads: ok
      ? 'no control buried'
      : `${seen.overlaps} overlapping   ${seen.overlapping.join('  ')}`,
    ok,
  };
}

function ringCheck(when: string, seen: Reading): Check {
  const ok = seen.rings === RINGS_EXPECTED;
  return {
    name: `focus ring ${when}`,
    reads: ok ? '1' : `${seen.rings}   ${seen.ringed.slice(0, RINGS_NAMED).join('  ')}`,
    ok,
  };
}

/** Everything the run is allowed to fail on, in the order a reader wants them:
 * the ring first, because a grid that lights every tile is the failure this
 * exists for. */
export function checks(run: Run): Check[] {
  const cap = Math.round(run.atRest.controls * run.growth);
  return [
    ringCheck('at rest', run.atRest),
    ringCheck('worst during walk', run.walked),
    overlapCheck('at rest', run.atRest),
    overlapCheck('worst during walk', run.walked),
    {
      name: 'console',
      reads: run.console.length === 0 ? 'clean' : `${run.console.length} errors`,
      ok: run.console.length === 0,
    },
    {
      name: 'controls mounted',
      reads: `${run.atRest.controls} -> ${run.walked.controls} (cap ${cap})   nodes ${run.atRest.nodes} -> ${run.walked.nodes}`,
      ok: run.walked.controls <= cap,
    },
    {
      name: 'frames',
      reads: run.frames
        ? `${run.frames.fps} fps, worst ${run.frames.worstFrame}ms, ${run.frames.jankyFrames} janky of ${run.frames.frameCount}   press-to-focus ${run.frames.responseP50}/${run.frames.responseWorst}ms`
        : 'no KROMA_PERF: the run measured nothing',
      ok: run.frames != null && run.frames.frameCount > 0 && run.frames.fps >= run.minFps,
    },
  ];
}
