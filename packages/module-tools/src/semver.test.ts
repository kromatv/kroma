import { describe, expect, it } from 'vitest';
import { compareRaw, parse } from './semver';

const sorted = (...versions: string[]) => [...versions].sort(compareRaw);

describe('parse', () => {
  it('accepts what modules validate accepts', () => {
    expect(parse('0.1.2')).toEqual({ major: 0, minor: 1, patch: 2, prerelease: [] });
    expect(parse('1.2.3-nightly.4')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['nightly', 4],
    });
    // Build metadata does not participate in ordering, per semver.
    expect(parse('1.0.0+abc')?.prerelease).toEqual([]);
  });

  it('rejects anything that cannot be ordered', () => {
    for (const bad of ['latest', '1.2', 'v1.2.3', '', '1.2.3.4']) {
      expect(parse(bad), bad).toBeNull();
    }
  });
});

describe('compareRaw', () => {
  it('orders by major, then minor, then patch', () => {
    expect(sorted('0.2.0', '0.1.9', '1.0.0', '0.1.10')).toEqual([
      '0.1.9',
      '0.1.10',
      '0.2.0',
      '1.0.0',
    ]);
  });

  it('puts a prerelease below the release it leads to', () => {
    expect(sorted('1.0.0', '1.0.0-nightly.1')).toEqual(['1.0.0-nightly.1', '1.0.0']);
  });

  it('orders numeric prerelease parts numerically, not as text', () => {
    // The reason this is not a string compare: "10" < "9" alphabetically, so a
    // nightly train would stop being able to publish after its ninth build.
    expect(sorted('1.0.0-nightly.9', '1.0.0-nightly.10')).toEqual([
      '1.0.0-nightly.9',
      '1.0.0-nightly.10',
    ]);
  });

  it('ranks a numeric identifier below an alphanumeric one', () => {
    expect(compareRaw('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
  });

  it('treats a longer prerelease chain as the higher one', () => {
    expect(compareRaw('1.0.0-a.1', '1.0.0-a')).toBeGreaterThan(0);
  });

  it('sorts an unorderable version below every real one', () => {
    expect(compareRaw('nonsense', '0.0.1')).toBeLessThan(0);
    expect(compareRaw('nonsense', 'also-nonsense')).toBe(0);
  });

  it('is zero for equal versions', () => {
    expect(compareRaw('1.2.3', '1.2.3')).toBe(0);
    expect(compareRaw('1.2.3-a.1', '1.2.3-a.1')).toBe(0);
  });
});
