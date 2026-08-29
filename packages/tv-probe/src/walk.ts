import type { Reading } from './reading';

export interface Remote {
  press(key: string): Promise<void>;
  read(): Promise<Reading>;
}

const KEY_CYCLE = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

function worse(seen: Reading, worst: Reading | null): boolean {
  if (!worst) return true;
  if (seen.rings !== worst.rings) return seen.rings > worst.rings;
  return seen.overlaps > worst.overlaps;
}

/** The walk, sampled after EVERY press rather than only at its end. The worst
 * reading is the one to judge, not the last. */
export async function walk(remote: Remote, presses: number): Promise<Reading> {
  let worst: Reading | null = null;
  let pressed = 0;
  while (pressed < presses) {
    for (const key of KEY_CYCLE) {
      if (pressed >= presses) break;
      await remote.press(key);
      pressed += 1;
      const seen = await remote.read();
      if (worse(seen, worst)) worst = seen;
    }
  }
  return worst ?? (await remote.read());
}
