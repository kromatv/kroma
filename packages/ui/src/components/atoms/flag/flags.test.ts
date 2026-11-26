import { describe, expect, it } from 'vitest';
import { fetchFlagSvg, flagSvgNow } from '#ui/lib/flag-svg';
import { isFlagRegion } from './flags';

describe('isFlagRegion', () => {
  it('takes any uppercase ISO 3166 code', () => {
    expect(isFlagRegion('FR')).toBe(true);
    expect(isFlagRegion('NP')).toBe(true);
  });

  it('refuses what is not one', () => {
    expect(isFlagRegion(null)).toBe(false);
    expect(isFlagRegion('fr')).toBe(false);
    expect(isFlagRegion('constructor')).toBe(false);
  });
});

describe('the flags a browser fetches', () => {
  it('arrive as SVG documents, and are at hand from then on', async () => {
    const svg = await fetchFlagSvg('CH');

    expect(svg).toMatch(/^<svg[\s>]/);
    expect(flagSvgNow('CH')).toBe(svg);
  });

  it('fetch each flag once, however many ask', async () => {
    const [first, second] = await Promise.all([fetchFlagSvg('NP'), fetchFlagSvg('NP')]);

    expect(first).toBe(second);
  });

  it('come back empty for a code with no flag', async () => {
    expect(await fetchFlagSvg('ZZ')).toBeUndefined();
    expect(await fetchFlagSvg('index')).toBeUndefined();
  });
});
