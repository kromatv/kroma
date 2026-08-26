import { describe, expect, it } from 'vitest';
import { displayName } from './display-name';

describe('displayName', () => {
  it('names a code it recognises', () => {
    expect(displayName('region', 'en')('CH')).toBe('Switzerland');
    expect(displayName('language', 'en')('fr-ch')).toBe('Swiss French');
  });

  it('falls back to the code rather than throwing on one it cannot parse', () => {
    expect(displayName('language', 'en')('aa-bb-cc-dd')).toBe('aa-bb-cc-dd');
    expect(displayName('language', 'en')('constructor')).toBe('constructor');
    expect(displayName('region', 'en')('Everything else')).toBe('Everything else');
    expect(displayName('region', 'en')('')).toBe('');
  });
});
