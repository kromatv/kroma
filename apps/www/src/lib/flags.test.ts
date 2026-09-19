import { describe, expect, it } from 'vitest';
import { flagUrl } from './flags';

describe('flagUrl', () => {
  it('finds the flag for a country code, including the one the edge uses for Kosovo', () => {
    expect(flagUrl('CH')).toContain('/CH.svg');
    expect(flagUrl('XK')).toContain('/XK.svg');
  });

  it('has no flag for what is not a country code', () => {
    expect(flagUrl('XX')).toBeUndefined();
    expect(flagUrl('ch')).toBeUndefined();
    expect(flagUrl('constructor')).toBeUndefined();
  });
});
