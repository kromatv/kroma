import { describe, expect, it, vi } from 'vitest';
import {
  attachHlsRecovery,
  driveStallRecovery,
  type HlsClassLike,
  STALL_POLL_MS,
  type StallSample,
  type StallStep,
  type StallWatch,
  stallWatch,
} from './playback-stall';

function playing(over: Partial<StallSample> = {}): StallSample {
  return {
    currentTime: 100,
    bufferedEnd: 160,
    paused: false,
    ended: false,
    seeking: false,
    readyState: 4,
    ...over,
  };
}

function hold(watch: StallWatch, from: number, polls: number, at = 100) {
  const steps: StallStep[] = [];
  let stalled = false;
  for (let i = 1; i <= polls; i += 1) {
    const verdict = watch.observe(playing({ currentTime: at }), from + i * STALL_POLL_MS);
    stalled = verdict.stalled;
    if (verdict.step) steps.push(verdict.step);
  }
  return { steps, stalled };
}

const HLS_CLASS: HlsClassLike = {
  Events: { ERROR: 'hlsError' },
  ErrorTypes: { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' },
};

function fakeHls() {
  let listener: (event: string, data: { type: string; fatal: boolean }) => void = () => undefined;
  const hls = {
    on: (_event: string, fn: typeof listener) => {
      listener = fn;
    },
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
  };

  return {
    hls,
    fire: (type: string, fatal = true) => listener('hlsError', { type, fatal }),
  };
}

describe('stallWatch', () => {
  it('asks for nothing while the picture is moving', () => {
    const watch = stallWatch();

    const verdicts = [0, 1, 2, 3, 4].map((i) =>
      watch.observe(playing({ currentTime: 100 + i }), i * STALL_POLL_MS),
    );

    expect(verdicts.every((v) => v.step === null && !v.stalled)).toBe(true);
  });

  it('nudges a playhead that has stopped with buffer still ahead of it', () => {
    const watch = stallWatch();
    watch.observe(playing(), 0);

    const { steps, stalled } = hold(watch, 0, 4);

    expect(steps).toEqual(['nudge']);
    expect(stalled).toBe(true);
  });

  it('climbs the ladder while the nudges do not take', () => {
    const watch = stallWatch();
    watch.observe(playing(), 0);

    const { steps } = hold(watch, 0, 20);

    expect(steps).toEqual(['nudge', 'nudge', 'recover', 'restart']);
  });

  it('stops climbing once the ladder runs out, and stays stalled', () => {
    const watch = stallWatch();
    watch.observe(playing(), 0);
    hold(watch, 0, 20);

    const { steps, stalled } = hold(watch, 20 * STALL_POLL_MS, 20);

    expect(steps).toEqual([]);
    expect(stalled).toBe(true);
  });

  it('does not read the jump a nudge itself makes as a recovery', () => {
    const watch = stallWatch();
    watch.observe(playing(), 0);
    expect(hold(watch, 0, 4).steps).toEqual(['nudge']);

    watch.observe(playing({ currentTime: 100.1 }), 2500);
    const { steps } = hold(watch, 2500, 5, 100.1);

    expect(steps).toEqual(['nudge']);
  });

  it('clears the ladder once the playhead keeps moving', () => {
    const watch = stallWatch();
    watch.observe(playing(), 0);
    hold(watch, 0, 4);

    watch.observe(playing({ currentTime: 100.1 }), 2500);
    watch.observe(playing({ currentTime: 100.6 }), 3000);
    const { steps, stalled } = hold(watch, 3000, 5, 100.6);

    expect(steps).toEqual(['nudge']);
    expect(stalled).toBe(true);
  });

  it('leaves a playhead that has genuinely run out to the engine', () => {
    const watch = stallWatch();

    const verdicts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      watch.observe(playing({ bufferedEnd: 100.2 }), i * STALL_POLL_MS),
    );

    expect(verdicts.every((v) => v.step === null && !v.stalled)).toBe(true);
  });

  it('is not a stall when nothing is meant to be playing', () => {
    for (const over of [
      { paused: true },
      { ended: true },
      { seeking: true },
      { readyState: 2 },
    ] satisfies Partial<StallSample>[]) {
      const watch = stallWatch();
      watch.observe(playing(), 0);
      hold(watch, 0, 4);

      const verdicts = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
        watch.observe(playing(over), 2000 + i * STALL_POLL_MS),
      );

      expect(verdicts.every((v) => v.step === null && !v.stalled)).toBe(true);
    }
  });
});

describe('attachHlsRecovery', () => {
  it('reloads on a fatal network error and recovers a fatal media one', () => {
    const giveUp = vi.fn();
    const { hls, fire } = fakeHls();
    attachHlsRecovery(HLS_CLASS, hls, giveUp);

    fire('networkError');
    fire('mediaError');

    expect(hls.startLoad).toHaveBeenCalledTimes(1);
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('leaves a non-fatal error to hls.js', () => {
    const giveUp = vi.fn();
    const { hls, fire } = fakeHls();
    attachHlsRecovery(HLS_CLASS, hls, giveUp);

    fire('mediaError', false);

    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('gives up once the same failure has survived its recoveries', () => {
    const giveUp = vi.fn();
    const { hls, fire } = fakeHls();
    attachHlsRecovery(HLS_CLASS, hls, giveUp);

    fire('mediaError');
    fire('mediaError');
    fire('mediaError');

    expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it('forgives a failure the film has since played through', () => {
    const giveUp = vi.fn();
    const { hls, fire } = fakeHls();
    attachHlsRecovery(HLS_CLASS, hls, giveUp);
    const clock = vi.spyOn(Date, 'now');

    clock.mockReturnValue(0);
    fire('mediaError');
    fire('mediaError');
    clock.mockReturnValue(120_000);
    fire('mediaError');

    expect(hls.recoverMediaError).toHaveBeenCalledTimes(3);
    expect(giveUp).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});

describe('driveStallRecovery', () => {
  function target(over: Partial<Record<string, unknown>> = {}) {
    let at = 100;
    const calls = {
      sample: () => ({ currentTime: at, bufferedEnd: at + 60, paused: false }),
      nudge: vi.fn(() => {
        at += 0.1;
      }),
      recover: vi.fn(() => true),
      restart: vi.fn(),
      ...over,
    };
    return { calls, move: (by: number) => (at += by) };
  }

  it('climbs the ladder in order and stops the interval when told', () => {
    vi.useFakeTimers();
    const t = target({ nudge: vi.fn() });

    const stop = driveStallRecovery(t.calls, vi.fn());
    vi.advanceTimersByTime(STALL_POLL_MS * 18);
    stop();
    vi.advanceTimersByTime(STALL_POLL_MS * 18);

    expect(t.calls.nudge).toHaveBeenCalledTimes(2);
    expect(t.calls.recover).toHaveBeenCalledTimes(1);
    expect(t.calls.restart).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('falls through to a fresh source when the recovery declines', () => {
    vi.useFakeTimers();
    const t = target({ nudge: vi.fn(), recover: vi.fn(() => false) });

    driveStallRecovery(t.calls, vi.fn());
    vi.advanceTimersByTime(STALL_POLL_MS * 14);

    expect(t.calls.recover).toHaveBeenCalledTimes(1);
    expect(t.calls.restart).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reports the stuck state, and clears it on the way out', () => {
    vi.useFakeTimers();
    const t = target({ nudge: vi.fn() });
    const onStalled = vi.fn();

    const stop = driveStallRecovery(t.calls, onStalled);
    vi.advanceTimersByTime(STALL_POLL_MS * 6);
    const whileStuck = onStalled.mock.calls.at(-1)?.[0];
    stop();

    expect(whileStuck).toBe(true);
    expect(onStalled).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it('polls nothing into the watch while the target has no sample', () => {
    vi.useFakeTimers();
    const t = target({ sample: () => null, nudge: vi.fn() });

    driveStallRecovery(t.calls, vi.fn());
    vi.advanceTimersByTime(STALL_POLL_MS * 18);

    expect(t.calls.nudge).not.toHaveBeenCalled();
    expect(t.calls.restart).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('holds a restart to one per cooldown', () => {
    vi.useFakeTimers();
    const t = target({ nudge: vi.fn() });

    driveStallRecovery(t.calls, vi.fn());
    vi.advanceTimersByTime(STALL_POLL_MS * 18);
    t.move(5);
    vi.advanceTimersByTime(STALL_POLL_MS);
    t.move(5);
    vi.advanceTimersByTime(STALL_POLL_MS);
    vi.advanceTimersByTime(STALL_POLL_MS * 18);

    expect(t.calls.restart).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
