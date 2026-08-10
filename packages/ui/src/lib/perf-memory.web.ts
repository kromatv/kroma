// What the JS heap is holding, web (Tizen / webOS / desktop / browser).
//
// `performance.memory` is a Chromium extension, never standardised and absent
// from Firefox and Safari - but every engine this tier actually ships on is
// Chromium, including the televisions, which is exactly where the number is
// worth having. Absent, it reports nothing rather than a zero that would read
// as "no memory used".

import type { MemoryReading } from './perf-memory';

interface ChromiumMemory {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

const MB = 1024 * 1024;

/** The JS heap right now, or null where the engine does not report one. */
export function readMemory(): MemoryReading | null {
  const memory = (performance as Performance & { memory?: ChromiumMemory }).memory;
  const used = memory?.usedJSHeapSize;
  if (typeof used !== 'number') return null;
  return {
    usedMb: Math.round(used / MB),
    limitMb: Math.round((memory?.jsHeapSizeLimit ?? 0) / MB),
  };
}

export type { MemoryReading };
