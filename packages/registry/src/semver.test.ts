import { describe, expect, it } from 'vitest';
import { channelOf, compareRaw, parse, satisfies } from './semver.ts';

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

describe('satisfies', () => {
  it('matches the caret range within the left-most non-zero segment', () => {
    expect(satisfies('0.1.9', '^0.1.0')).toBe(true);
    expect(satisfies('0.2.0', '^0.1.0')).toBe(false);
    expect(satisfies('1.9.0', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
  });

  it('matches tilde within the minor, and >= upwards', () => {
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfies('9.9.9', '>=1.0.0')).toBe(true);
    expect(satisfies('0.9.9', '>=1.0.0')).toBe(false);
  });

  it('treats a bare version as exact', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  it('keeps pre-releases opt-in', () => {
    expect(satisfies('0.2.0-beta.1', '^0.1.0')).toBe(false);
    expect(satisfies('0.2.0-beta.1', '*')).toBe(false);
    expect(satisfies('0.2.0-beta.2', '^0.2.0-beta.1')).toBe(true);
    expect(satisfies('0.3.0-beta.1', '^0.2.0-beta.1')).toBe(false);
  });

  it('satisfies nothing when either side is unreadable', () => {
    expect(satisfies('nightly', '^1.0.0')).toBe(false);
    expect(satisfies('1.0.0', '^nightly')).toBe(false);
  });
});

describe('channelOf', () => {
  it('names the channel a version publishes to', () => {
    expect(channelOf('1.0.0')).toBe('latest');
    expect(channelOf('1.0.0-beta.3')).toBe('beta');
    expect(channelOf('1.0.0-rc.1')).toBe('rc');
  });

  it('ignores build metadata, which is not a channel', () => {
    expect(channelOf('1.0.0+exp-sha.5114f85')).toBe('latest');
  });

  it('has no channel for a numeric pre-release or a version it cannot read', () => {
    expect(channelOf('1.0.0-1')).toBeNull();
    expect(channelOf('nightly')).toBeNull();
  });
});
