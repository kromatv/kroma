import { describe, expect, it } from 'vitest';
import type { Reading } from './reading';
import { walk } from './walk';

function reading(over: Partial<Reading> = {}): Reading {
  return {
    rings: 1,
    ringed: [],
    controls: 10,
    nodes: 200,
    overlaps: 0,
    overlapping: [],
    ...over,
  };
}

function remote(...readings: Reading[]) {
  const pressed: string[] = [];
  let at = 0;
  return {
    pressed,
    press: async (key: string) => {
      pressed.push(key);
    },
    read: async () => readings[Math.min(at++, readings.length - 1)] ?? reading(),
  };
}

describe('the walk', () => {
  it('returns the worst reading it saw mid-walk, not the last one', async () => {
    const flare = remote(reading(), reading({ rings: 9 }), reading());

    await expect(walk(flare, 3)).resolves.toMatchObject({ rings: 9 });
  });

  it('judges more rings worse than more controls buried', async () => {
    const both = remote(reading({ rings: 2 }), reading({ rings: 1, overlaps: 9 }));

    await expect(walk(both, 2)).resolves.toMatchObject({ rings: 2, overlaps: 0 });
  });

  it('breaks a tie on rings by what is buried', async () => {
    const tied = remote(reading({ overlaps: 1 }), reading({ overlaps: 5 }));

    await expect(walk(tied, 2)).resolves.toMatchObject({ overlaps: 5 });
  });

  it('reads the screen once and presses nothing when asked for no presses', async () => {
    const idle = remote(reading({ controls: 42 }));

    await expect(walk(idle, 0)).resolves.toMatchObject({ controls: 42 });
    expect(idle.pressed).toEqual([]);
  });

  it('starts the six-key cycle again rather than stopping at its end', async () => {
    const long = remote(reading());

    await walk(long, 8);

    expect(long.pressed).toHaveLength(8);
    expect(long.pressed.slice(6)).toEqual(long.pressed.slice(0, 2));
  });
});
