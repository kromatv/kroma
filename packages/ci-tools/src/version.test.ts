import { describe, expect, it } from 'vitest';
import { buildNumber, type Context, resolveVersion } from './version';

const NOW = new Date('2026-08-23T10:00:00Z');

const context = (over: Partial<Context>): Context => ({
  event: 'push',
  refType: 'branch',
  refName: 'main',
  input: undefined,
  manifestVersion: '0.1.39',
  now: NOW,
  ...over,
});

describe('resolveVersion', () => {
  it('builds a push to main as a candidate of the version main is on', () => {
    const resolved = resolveVersion(context({}));

    expect(resolved.version).toBe('0.1.39');
    expect(resolved.triplet).toBe('0.1.39');
    expect(resolved.channel).toBe('candidate');
    expect(resolved.canary).toBe(`0.1.39-canary.${buildNumber(NOW)}`);
  });

  it('releases a tag push as stable, stamped with the tag', () => {
    const resolved = resolveVersion(context({ refType: 'tag', refName: 'v0.2.0-rc1' }));

    expect(resolved).toMatchObject({ version: '0.2.0-rc1', triplet: '0.2.0', channel: 'stable' });
  });

  it('refuses a tag that is not the product shape', () => {
    expect(() => resolveVersion(context({ refType: 'tag', refName: 'canary' }))).toThrow(
      /not vX\.Y\.Z/,
    );
  });

  it('builds a dispatch on whatever it was asked for and publishes nothing', () => {
    expect(resolveVersion(context({ event: 'workflow_dispatch', input: '9.9.9' }))).toMatchObject({
      version: '9.9.9',
      channel: 'none',
    });
    expect(resolveVersion(context({ event: 'workflow_dispatch', input: '' }))).toMatchObject({
      version: '0.1.39',
      channel: 'none',
    });
  });
});

describe('buildNumber', () => {
  it('counts minutes since 2020 and only ever goes up', () => {
    expect(buildNumber(new Date('2020-01-01T00:01:00Z'))).toBe(1);
    expect(buildNumber(new Date('2026-08-23T10:01:00Z'))).toBe(buildNumber(NOW) + 1);
  });
});
