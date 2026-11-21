interface Reading {
  positionMs: number;
  playing: boolean;
}

interface Last extends Reading {
  at: number;
}

const JUMP_MS = 1500;

function expected(last: Last, now: number): number {
  return last.playing ? last.positionMs + (now - last.at) : last.positionMs;
}

/**
 * Tells a seek from a playhead that is simply advancing. Each reading is held
 * against where the last one says the playhead should be by now; more than a
 * second and a half apart is a jump, whoever made it: a remote, the
 * television's own keys, or a film starting over.
 */
export function createPlayheadClock() {
  let last: Last | null = null;
  return {
    /** Whether `reading` is a jump from the one before. `null` is no player,
     * and forgets: the first reading of the next player is never a jump. */
    jumped(reading: Reading | null, now = Date.now()): boolean {
      const before = last;
      last = reading ? { ...reading, at: now } : null;
      if (!(reading && before)) {
        return false;
      }
      return Math.abs(reading.positionMs - expected(before, now)) > JUMP_MS;
    },
  };
}
