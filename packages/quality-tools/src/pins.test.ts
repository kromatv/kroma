import { describe, expect, it } from 'vitest';
import { parsePins } from './pins';

const SHA = {
  crapper: 'a'.repeat(40),
  dryer: 'b'.repeat(40),
  mutator: 'c'.repeat(40),
};

const PINS = [
  `crapper https://github.com/unclebob/crapper ${SHA.crapper}`,
  `dryer https://github.com/unclebob/dryer ${SHA.dryer}`,
  `mutator https://github.com/unclebob/mutator ${SHA.mutator}`,
];

describe('parsePins', () => {
  it('reads one name, url and commit per line', () => {
    const pins = parsePins(`${PINS.join('\n')}\n`);

    expect(pins).toEqual([
      { name: 'crapper', url: 'https://github.com/unclebob/crapper', commit: SHA.crapper },
      { name: 'dryer', url: 'https://github.com/unclebob/dryer', commit: SHA.dryer },
      { name: 'mutator', url: 'https://github.com/unclebob/mutator', commit: SHA.mutator },
    ]);
  });

  it('skips blank lines and takes any run of spaces between fields', () => {
    const spaced = PINS.map((line) => `  ${line.replaceAll(' ', '   ')}`).join('\n\n');

    expect(parsePins(spaced)).toHaveLength(3);
  });

  it('rejects a branch name where a commit belongs', () => {
    const moving = [PINS[0], PINS[1], 'mutator https://github.com/unclebob/mutator main'];

    expect(() => parsePins(moving.join('\n'))).toThrow(/is not 'name url commit'/);
  });

  it('rejects a url that is not an https GitHub repository', () => {
    const elsewhere = [PINS[0], PINS[1], `mutator git@github.com:unclebob/mutator ${SHA.mutator}`];

    expect(() => parsePins(elsewhere.join('\n'))).toThrow(/is not 'name url commit'/);
  });

  it('rejects a tool it does not know and a line with a fourth field', () => {
    expect(() => parsePins(`linter https://github.com/a/b ${SHA.dryer}`)).toThrow(/linter/);
    expect(() => parsePins(`${PINS[0]} extra`)).toThrow(/extra/);
  });

  it('wants every tool pinned exactly once', () => {
    expect(() => parsePins(PINS.slice(0, 2).join('\n'))).toThrow(/mutator is pinned 0 times/);
    expect(() => parsePins([...PINS, PINS[1]].join('\n'))).toThrow(/dryer is pinned 2 times/);
  });
});
