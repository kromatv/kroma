import { FLAGGED_LOCALES, flagRegion } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { flagSvg, isFlagRegion } from './flags';

describe('the flags the kit draws', () => {
  it('include one for every language the core table gives a flag to', () => {
    const undrawn = FLAGGED_LOCALES.filter((code) => !isFlagRegion(flagRegion(code)));

    expect(undrawn).toEqual([]);
  });

  it('leave out a region they hold no vectors for', () => {
    expect(isFlagRegion('CA')).toBe(false);
    expect(isFlagRegion(null)).toBe(false);
  });

  it('do not take an object key for a region', () => {
    expect(isFlagRegion('constructor')).toBe(false);
  });

  it('are SVG documents', () => {
    expect(flagSvg('FR')).toMatch(/^<svg[\s>]/);
  });
});
