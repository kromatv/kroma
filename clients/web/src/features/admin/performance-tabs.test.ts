import { describe, expect, it } from 'vitest';
import { idFromUrl, urlId } from './performance-tabs';

describe('urlId', () => {
  it('round-trips a key too long for a JavaScript number', () => {
    const key = '4611686018427387904';

    expect(idFromUrl(urlId(key))).toBe(key);
    expect(Number(urlId(key))).toBeNaN();
  });

  it('reads nothing from an absent value', () => {
    expect(idFromUrl(undefined)).toBeUndefined();
  });
});
