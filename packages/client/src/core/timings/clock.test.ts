import { afterEach, describe, expect, it, vi } from 'vitest';
import { monotonicNow } from './clock';

describe('monotonicNow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the monotonic clock where there is one', () => {
    vi.stubGlobal('performance', { now: () => 42 });

    expect(monotonicNow()).toBe(42);
  });

  it('falls back to the wall clock on an engine without one', () => {
    vi.stubGlobal('performance', { memory: {} });
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(monotonicNow()).toBe(1_700_000_000_000);
  });
});
