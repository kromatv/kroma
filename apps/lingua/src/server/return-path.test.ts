import { describe, expect, it } from 'vitest';
import { returnPath } from './return-path';

describe('returnPath', () => {
  it('keeps a page of this site, with its query and its fragment', () => {
    expect(returnPath('/o/r/fr/p?filter=missing#p.play')).toBe('/o/r/fr/p?filter=missing#p.play');
  });

  it('falls back to the home page for nothing, or for an address that is no path', () => {
    const given = [undefined, '', 'o/r', 'https://evil.test/o/r', 'javascript:alert(1)'];

    expect(given.map(returnPath)).toEqual(['/', '/', '/', '/', '/']);
  });

  it('refuses a path a browser would read as another site', () => {
    const given = [
      '//evil.test',
      '/\\evil.test',
      '/\t/evil.test',
      '/\n/evil.test',
      '/\r\\evil.test',
    ];

    expect(given.map(returnPath)).toEqual(['/', '/', '/', '/', '/']);
  });
});
