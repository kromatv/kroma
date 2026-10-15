import { describe, expect, it } from 'vitest';
import {
  type ArrivalStallSample,
  type ArrivalStallStep,
  arrivalStallWatch,
} from './watchable-stall';

const STUCK: ArrivalStallSample = {
  atSec: 117,
  bufferedSec: 119,
  wanted: true,
  waiting: true,
  failed: false,
  started: true,
  arrived: [[0, 190]],
  durationSec: 658,
};

function steps(
  sampleAt: (ms: number) => ArrivalStallSample,
  untilMs: number,
): [number, ArrivalStallStep][] {
  const watch = arrivalStallWatch();
  const taken: [number, ArrivalStallStep][] = [];
  for (let ms = 0; ms <= untilMs; ms += 1_000) {
    const step = watch.observe(sampleAt(ms), ms);
    if (step) taken.push([ms, step]);
  }
  return taken;
}

const reopenings = (sampleAt: (ms: number) => ArrivalStallSample, untilMs: number) =>
  steps(sampleAt, untilMs).map(([ms]) => ms);

describe('a player stuck where the film has arrived', () => {
  it('is opened again once the playhead has sat still over film on disk for eight seconds', () => {
    expect(reopenings(() => STUCK, 20_000)).toEqual([9_000]);
  });

  it('is opened again at most once every thirty seconds while it stays stuck', () => {
    expect(reopenings(() => STUCK, 60_000)).toEqual([9_000, 47_000]);
  });

  it('is reloaded first, and reanchored when the reload leaves it stuck with nothing loaded', () => {
    const empty = (ms: number) => ({ ...STUCK, bufferedSec: ms <= 9_000 ? 119 : Number.NaN });

    expect(steps(empty, 60_000)).toEqual([
      [9_000, 'reload'],
      [47_000, 'reanchor'],
    ]);
  });

  it('is only reloaded again when the reload loaded film up to where the arrival stopped', () => {
    expect(steps(() => STUCK, 60_000)).toEqual([
      [9_000, 'reload'],
      [47_000, 'reload'],
    ]);
  });

  it('is reloaded again, not reanchored, once it has stalled somewhere new', () => {
    const later = (ms: number) => ({ ...STUCK, atSec: ms < 20_000 ? 117 : 160 });

    expect(steps(later, 60_000)).toEqual([
      [9_000, 'reload'],
      [47_000, 'reload'],
    ]);
  });

  it('is reloaded again, not reanchored, when the reload bought a few seconds before it stuck', () => {
    const helped = (ms: number) => ({ ...STUCK, atSec: ms < 20_000 ? 117 : 121 });

    expect(steps(helped, 60_000)).toEqual([
      [9_000, 'reload'],
      [47_000, 'reload'],
    ]);
  });

  it('is opened again once what it has loaded stops growing too', () => {
    const drying = (ms: number) => ({
      ...STUCK,
      bufferedSec: 119 + 2 * Math.floor(Math.min(ms, 20_000) / 5_000),
    });

    expect(reopenings(drying, 40_000)).toEqual([29_000]);
  });

  it('is judged by its playhead alone when it cannot say what it has loaded', () => {
    expect(reopenings(() => ({ ...STUCK, bufferedSec: Number.NaN }), 20_000)).toEqual([9_000]);
  });

  it('is counted afresh once its playhead has moved', () => {
    const moved = (ms: number) => ({ ...STUCK, atSec: ms < 5_000 ? 117 : 121 });

    expect(reopenings(moved, 20_000)).toEqual([14_000]);
  });

  it('counts the film to its end rather than fifteen seconds past it', () => {
    const last = { ...STUCK, atSec: 650, arrived: [[600, 658]] as const };

    expect(reopenings(() => last, 20_000)).toEqual([9_000]);
  });
});

describe('a player that gave the stream up while the film was arriving', () => {
  const GAVE_UP = {
    ...STUCK,
    atSec: 160,
    bufferedSec: Number.NaN,
    waiting: false,
    failed: true,
    arrived: [[0, 191]] as const,
  };

  it('is left alone while nothing more arrives, whatever the map claims ahead of it', () => {
    expect(reopenings(() => GAVE_UP, 120_000)).toEqual([]);
  });

  it('is reloaded, never reanchored, each time more film has arrived since', () => {
    const reached = (ms: number) => {
      if (ms < 20_000) return 191;
      return ms < 70_000 ? 197 : 203;
    };
    const arriving = (ms: number) => ({ ...GAVE_UP, arrived: [[0, reached(ms)]] as const });

    expect(steps(arriving, 100_000)).toEqual([
      [20_000, 'reload'],
      [70_000, 'reload'],
    ]);
  });

  it('is reloaded after a minute when the source keeps no map', () => {
    expect(reopenings(() => ({ ...GAVE_UP, arrived: null }), 90_000)).toEqual([60_000]);
  });
});

describe('a player that never started', () => {
  it('is opened again once the film under it has sat on disk for twenty seconds', () => {
    const opened = { ...STUCK, atSec: 0, started: false };

    expect(reopenings(() => opened, 30_000)).toEqual([21_000]);
  });
});

describe('a player the watch leaves alone', () => {
  it('waits for the film under the playhead to arrive', () => {
    const edge = { ...STUCK, arrived: [[0, 125]] as const };

    expect(reopenings(() => edge, 120_000)).toEqual([]);
  });

  it('waits at the real edge while the player keeps loading, whatever the map claims', () => {
    const loading = (ms: number) => ({ ...STUCK, bufferedSec: 119 + 2 * Math.floor(ms / 5_000) });

    expect(reopenings(loading, 120_000)).toEqual([]);
  });

  it('leaves a film that is playing', () => {
    const playing = (ms: number) => ({ ...STUCK, atSec: 117 + ms / 1_000 });

    expect(reopenings(playing, 30_000)).toEqual([]);
  });

  it('leaves a film the viewer paused, and one the player is not waiting on', () => {
    expect(reopenings(() => ({ ...STUCK, wanted: false }), 30_000)).toEqual([]);
    expect(reopenings(() => ({ ...STUCK, waiting: false }), 30_000)).toEqual([]);
  });
});

describe('a source that keeps no map of what arrived', () => {
  it('has its stream opened again after a minute stuck, as an MSE engine would give up', () => {
    expect(reopenings(() => ({ ...STUCK, arrived: null }), 90_000)).toEqual([60_000]);
  });
});
