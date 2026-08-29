import { describe, expect, it } from 'vitest';
import { type Check, checks } from './check';
import type { Frames } from './read';
import type { Reading } from './reading';

type Run = Parameters<typeof checks>[0];

const CLEAN: Reading = {
  rings: 1,
  ringed: ['tab:Films'],
  controls: 20,
  nodes: 400,
  overlaps: 0,
  overlapping: [],
};

const SMOOTH: Frames = {
  fps: 55,
  worstFrame: 31,
  jankyFrames: 2,
  frameCount: 300,
  responseP50: 40,
  responseWorst: 96,
};

function run(over: Partial<Run> = {}): Check[] {
  return checks({
    atRest: CLEAN,
    walked: CLEAN,
    frames: SMOOTH,
    console: [],
    growth: 3,
    minFps: 20,
    ...over,
  });
}

function verdict(rows: Check[], name: string): Check {
  const row = rows.find((each) => each.name === name);
  if (!row) throw new Error(`no check named "${name}"; the run reads ${rows.length} rows`);
  return row;
}

describe('the checks a run is allowed to fail on', () => {
  it('passes a screen with one ring, nothing buried and a quiet console', () => {
    expect(run().every(({ ok }) => ok)).toBe(true);
  });

  it('names up to six of the controls wearing a second ring', () => {
    const lit = { ...CLEAN, rings: 8, ringed: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };

    const row = verdict(run({ walked: lit }), 'focus ring worst during walk');

    expect(row.ok).toBe(false);
    expect(row.reads).toBe('8   a  b  c  d  e  f');
  });

  it('names what a buried control is buried under', () => {
    const stacked = { ...CLEAN, overlaps: 2, overlapping: ['button:A under div:B'] };

    const row = verdict(run({ atRest: stacked }), 'layout at rest');

    expect(row.ok).toBe(false);
    expect(row.reads).toBe('2 overlapping   button:A under div:B');
  });

  it('counts the console complaints rather than repeating them', () => {
    const row = verdict(run({ console: ['boom', 'boom', 'bang'] }), 'console');

    expect(row.ok).toBe(false);
    expect(row.reads).toBe('3 errors');
  });

  it('allows the walk to mount up to the growth cap and no further', () => {
    const cap = { ...CLEAN, controls: 60 };
    const past = { ...CLEAN, controls: 61 };

    expect(verdict(run({ walked: cap }), 'controls mounted').ok).toBe(true);
    expect(verdict(run({ walked: past }), 'controls mounted').ok).toBe(false);
  });

  it('fails when the app measured nothing at all', () => {
    const row = verdict(run({ frames: null }), 'frames');

    expect(row.ok).toBe(false);
    expect(row.reads).toBe('no KROMA_PERF: the run measured nothing');
  });

  it('fails on a frame counter that reported not one frame', () => {
    const idle = { ...SMOOTH, frameCount: 0 };

    expect(verdict(run({ frames: idle }), 'frames').ok).toBe(false);
  });

  it('fails on a frame rate under the floor the run was given', () => {
    const slow = { ...SMOOTH, fps: 19 };

    const row = verdict(run({ frames: slow }), 'frames');

    expect(row.ok).toBe(false);
    expect(row.reads).toContain('19 fps, worst 31ms, 2 janky of 300   press-to-focus 40/96ms');
  });
});
