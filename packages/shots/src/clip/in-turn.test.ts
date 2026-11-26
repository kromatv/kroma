import { describe, expect, it } from 'vitest';
import { inTurn } from './in-turn';

describe('steps run in turn', () => {
  it('start each step once the one before it has settled, and keep their order', async () => {
    const log: string[] = [];
    const step = async (name: string) => {
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, name === 'a' ? 20 : 0));
      log.push(`end ${name}`);
      return name.toUpperCase();
    };

    const results = await inTurn(['a', 'b'], step);

    expect(results).toEqual(['A', 'B']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('stop at the first step that rejects', async () => {
    const ran: number[] = [];
    const step = async (n: number) => {
      ran.push(n);
      if (n === 2) {
        throw new Error('two');
      }
      return n;
    };

    await expect(inTurn([1, 2, 3], step)).rejects.toThrow('two');
    expect(ran).toEqual([1, 2]);
  });

  it('settle on nothing for no item', async () => {
    await expect(inTurn([], async () => 1)).resolves.toEqual([]);
  });
});
