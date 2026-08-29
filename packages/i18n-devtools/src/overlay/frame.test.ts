import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { perFrame } from './frame';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 0) as unknown);
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('running at most once a frame', () => {
  it('runs the work once however often it is asked', () => {
    const work = vi.fn();
    const at = perFrame(work);

    at.fire();
    at.fire();
    at.fire();
    vi.runAllTimers();

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('runs again on the next frame it is asked for', () => {
    const work = vi.fn();
    const at = perFrame(work);

    at.fire();
    vi.runAllTimers();
    at.fire();
    vi.runAllTimers();

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('does nothing until it is asked', () => {
    const work = vi.fn();
    perFrame(work);

    vi.runAllTimers();

    expect(work).not.toHaveBeenCalled();
  });

  it('drops a frame that has not run yet', () => {
    const work = vi.fn();
    const at = perFrame(work);

    at.fire();
    at.stop();
    vi.runAllTimers();

    expect(work).not.toHaveBeenCalled();
  });

  it('can be asked again after being stopped', () => {
    const work = vi.fn();
    const at = perFrame(work);

    at.fire();
    at.stop();
    at.fire();
    vi.runAllTimers();

    expect(work).toHaveBeenCalledTimes(1);
  });
});
