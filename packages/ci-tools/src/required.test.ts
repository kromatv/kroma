import { describe, expect, it } from 'vitest';
import { blockers, type Needs } from './required';

const LANE_OF = { checks: 'code', desktop: 'desktop' };

const run = (
  lanes: Record<string, string>,
  jobs: Record<string, Needs[string]['result']>,
): Needs => ({
  lanes: { result: 'success', outputs: lanes },
  ...Object.fromEntries(
    Object.entries(jobs).map(([job, result]) => [job, { result, outputs: {} }]),
  ),
});

describe('blockers', () => {
  it('passes when every job ran green', () => {
    const needs = run({ code: 'true', desktop: 'true' }, { checks: 'success', desktop: 'success' });

    expect(blockers(needs, LANE_OF)).toEqual([]);
  });

  it('passes a job skipped because its lane was off', () => {
    const needs = run(
      { code: 'true', desktop: 'false' },
      { checks: 'success', desktop: 'skipped' },
    );

    expect(blockers(needs, LANE_OF)).toEqual([]);
  });

  it('blocks when lanes itself did not succeed, whatever the jobs reported', () => {
    const needs: Needs = {
      lanes: { result: 'failure', outputs: {} },
      checks: { result: 'skipped', outputs: {} },
      desktop: { result: 'skipped', outputs: {} },
    };

    expect(blockers(needs, LANE_OF)).toEqual(['lanes ended failure']);
  });

  it('blocks a job skipped with its lane on, and one that failed or was cancelled', () => {
    const needs = run(
      { code: 'true', desktop: 'true' },
      { checks: 'skipped', desktop: 'cancelled' },
    );

    expect(blockers(needs, LANE_OF)).toEqual([
      "checks was skipped with lane 'code' on",
      'desktop ended cancelled',
    ]);
  });

  it('blocks a failure even when the lane was off', () => {
    const needs = run(
      { code: 'false', desktop: 'false' },
      { checks: 'failure', desktop: 'skipped' },
    );

    expect(blockers(needs, LANE_OF)).toEqual(['checks ended failure']);
  });

  it('keeps the job map honest against the needs and the lanes outputs', () => {
    const needs = run({ code: 'true' }, { checks: 'success', sonar: 'success' });

    expect(blockers(needs, LANE_OF)).toEqual(['sonar has no lane', 'desktop is not in needs']);
    expect(blockers(run({}, { checks: 'skipped' }), { checks: 'code' })).toEqual([
      "checks's lane 'code' is not a lanes output",
    ]);
  });
});
