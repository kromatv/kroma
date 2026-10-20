import { describe, expect, it } from 'vitest';
import { createFrameLoop } from './loop';

function fakeFrames() {
  const queue: Array<(now: number) => void> = [];
  return {
    schedule: (run: (now: number) => void) => queue.push(run),
    cancel: (handle: number) => {
      queue[handle - 1] = () => {};
    },
    flush: (now: number) => queue.splice(0).forEach((run) => run(now)),
    pending: () => queue.length,
  };
}

describe('createFrameLoop', () => {
  it('runs while the tick asks for more and stops when it does not', () => {
    const frames = fakeFrames();
    let left = 2;
    const loop = createFrameLoop(() => (left -= 1) > 0, frames.schedule, frames.cancel);

    loop.request();
    frames.flush(16);
    frames.flush(32);

    expect(left).toBe(0);
    expect(frames.pending()).toBe(0);
  });

  it('schedules one frame however often it is requested', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop(() => false, frames.schedule, frames.cancel);

    loop.request();
    loop.request();

    expect(frames.pending()).toBe(1);
  });

  it('cancels the pending frame on stop and can be requested again', () => {
    const frames = fakeFrames();
    let ticks = 0;
    const loop = createFrameLoop(
      () => {
        ticks += 1;
        return false;
      },
      frames.schedule,
      frames.cancel,
    );

    loop.request();
    loop.stop();
    frames.flush(16);
    loop.stop();
    loop.request();
    frames.flush(32);

    expect(ticks).toBe(1);
  });
});
