// The web half reads a Chromium extension that is not in any spec, so what is
// pinned here is the absence case: an engine without `performance.memory` must
// report NOTHING, never a zero. A zero renders in the HUD as "no memory used",
// which is a reading, and a wrong one.

import { afterEach, describe, expect, it } from 'vitest';
import { readMemory } from './perf-memory';

const MB = 1024 * 1024;

function withMemory(memory: unknown) {
  Object.defineProperty(performance, 'memory', {
    value: memory,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(performance, 'memory');
});

describe('readMemory (web)', () => {
  it('reports the heap in whole MB', () => {
    withMemory({ usedJSHeapSize: 40 * MB, jsHeapSizeLimit: 512 * MB });
    expect(readMemory()).toEqual({ usedMb: 40, limitMb: 512 });
  });

  it('says nothing at all where the engine does not report one', () => {
    expect(readMemory()).toBeNull();
    withMemory(undefined);
    expect(readMemory()).toBeNull();
    withMemory({});
    expect(readMemory()).toBeNull();
  });

  it('reports a limit of 0 when the engine gives a heap but no ceiling', () => {
    withMemory({ usedJSHeapSize: 12 * MB });
    expect(readMemory()).toEqual({ usedMb: 12, limitMb: 0 });
  });
});
