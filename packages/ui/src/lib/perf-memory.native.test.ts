// Hermes keeps no `performance.memory`, and the numbers a native app would want
// (RSS, the image cache, the texture pool) are not the JS heap anyway. The
// native half therefore has nothing honest to give, and this pins that it says
// so rather than reporting a zero the HUD would draw as a real reading.

import { describe, expect, it } from 'vitest';
import { readMemory } from './perf-memory';

describe('readMemory (native)', () => {
  it('reports nothing rather than something misleading', () => {
    expect(readMemory()).toBeNull();
  });
});
