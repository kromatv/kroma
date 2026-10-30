import { describe, expect, it } from 'vitest';
import { androidVersionCode } from './version';

describe('Android release version codes', () => {
  it('keeps mobile and TV distinct, with both below the next release', () => {
    const build = 3_590_000;
    expect(androidVersionCode(build, 'mobile')).toBeLessThan(androidVersionCode(build, 'tv'));
    expect(androidVersionCode(build, 'tv')).toBeLessThan(androidVersionCode(build + 1, 'mobile'));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 210_000_001])(
    'refuses a build number Play cannot accept: %s',
    (build) => expect(() => androidVersionCode(build, 'mobile')).toThrow(/version code/),
  );

  it('enforces the Play limit for the TV suffix too', () => {
    expect(androidVersionCode(210_000_000, 'mobile')).toBe(2_100_000_000);
    expect(() => androidVersionCode(210_000_000, 'tv')).toThrow(/version code/);
  });
});
