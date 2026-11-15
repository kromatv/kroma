import { describe, expect, it } from 'vitest';
import { parseScope } from './scope';

describe('parseScope', () => {
  it('covers everything when given nothing', () => {
    expect(parseScope([])).toEqual({ paths: [], lcov: [] });
  });

  it('reads paths and every --lcov report', () => {
    expect(parseScope(['packages/core', '--lcov', 'a.info', 'server', '--lcov=b.info'])).toEqual({
      paths: ['packages/core', 'server'],
      lcov: ['a.info', 'b.info'],
    });
  });

  it('refuses a flag it does not know', () => {
    expect(() => parseScope(['--threshold', '30'])).toThrow();
  });
});
