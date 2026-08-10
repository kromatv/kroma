// What the JS heap is holding, native (iOS / tvOS / Android / Android TV).
//
// One API, two files, like the rest of lib/: the HUD asks and renders whatever
// it gets. See perf-memory.web.ts for the half that has a number to give.

export interface MemoryReading {
  /** JS heap in use, MB. */
  usedMb: number;
  /** What the engine will let the heap grow to, MB, or 0 when it will not say. */
  limitMb: number;
}

/** The JS heap right now, or null where the engine does not report one.
 *
 * Hermes keeps no `performance.memory`, and the numbers a native app would want
 * (RSS, the image cache, the texture pool) are not the JS heap anyway, so this
 * says nothing rather than something misleading. */
export function readMemory(): MemoryReading | null {
  return null;
}
