import { describe, expect, it } from 'vitest';
import { stampAppinfo } from './stamp-version';

describe('webOS manifest stamping', () => {
  it('replaces the version and preserves store metadata and nested extension fields', () => {
    const source = {
      id: 'tv.kroma.webos',
      version: '1.0.0',
      title: 'Kroma',
      extension: { flags: [true, null, 4] },
    };
    expect(JSON.parse(stampAppinfo(JSON.stringify(source), '2.3.4'))).toEqual({
      ...source,
      version: '2.3.4',
    });
  });

  it.each(['null', '[]', '42', '{"version":42}', '{invalid'])(
    'rejects a malformed manifest: %s',
    (source) => {
      expect(() => stampAppinfo(source, '2.3.4')).toThrow();
    },
  );

  it('bounds the manifest size before parsing it', () => {
    expect(() => stampAppinfo(' '.repeat(1_000_001), '2.3.4')).toThrow('exceeds 1 MB');
  });

  it('bounds the number of manifest extension fields', () => {
    const source = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`field${i}`, i]));
    expect(() => stampAppinfo(JSON.stringify(source), '2.3.4')).toThrow();
  });
});
