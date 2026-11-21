import { describe, expect, it } from 'vitest';
import { parseGateScope, parseScope } from './scope';

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

describe('parseGateScope', () => {
  it('measures against origin/main when no base is named', () => {
    expect(parseGateScope([])).toEqual({ base: 'origin/main', lcov: [] });
  });

  it('reads the base and every --lcov report', () => {
    expect(parseGateScope(['--base', 'origin/release', '--lcov', 'a.info'])).toEqual({
      base: 'origin/release',
      lcov: ['a.info'],
    });
  });

  it('refuses a path, since the gate judges the whole change', () => {
    expect(() => parseGateScope(['packages/core'])).toThrow();
  });
});
