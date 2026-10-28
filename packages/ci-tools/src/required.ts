import { z } from 'zod';

const Need = z.object({
  result: z.enum(['success', 'failure', 'cancelled', 'skipped']),
  outputs: z.record(z.string(), z.string()).default({}),
});

/** The `needs` context as `toJSON(needs)` hands it to a job. */
export const Needs = z.record(z.string(), Need);
export type Needs = z.infer<typeof Needs>;

/** Each gated job's lane, by job id: the `lanes` output that decides whether it runs. */
export const LaneOf = z.record(z.string(), z.string().min(1));
export type LaneOf = z.infer<typeof LaneOf>;

function blocker(job: string, need: Needs[string], lane: string, on: boolean): string | null {
  if (need.result === 'success') return null;
  if (need.result === 'skipped' && !on) return null;
  if (need.result === 'skipped') return `${job} was skipped with lane '${lane}' on`;
  return `${job} ended ${need.result}`;
}

/**
 * Why the one required check is red, a line per job, or nothing when the run
 * may merge. A job may be skipped only because `lanes` turned its lane off: a
 * `lanes` that did not succeed, or a skip with the lane on, blocks, where a
 * skipped required check alone reports as a pass.
 */
export function blockers(needs: Needs, laneOf: LaneOf): string[] {
  const lanes = needs.lanes;
  if (lanes?.result !== 'success') return [`lanes ended ${lanes?.result ?? 'missing'}`];

  const out: string[] = [];
  for (const job of Object.keys(needs)) {
    if (job !== 'lanes' && !(job in laneOf)) out.push(`${job} has no lane`);
  }
  for (const [job, lane] of Object.entries(laneOf)) {
    const need = needs[job];
    const flag = lanes.outputs[lane];
    if (!need) out.push(`${job} is not in needs`);
    else if (flag === undefined) out.push(`${job}'s lane '${lane}' is not a lanes output`);
    else {
      const reason = blocker(job, need, lane, flag === 'true');
      if (reason) out.push(reason);
    }
  }
  return out;
}
