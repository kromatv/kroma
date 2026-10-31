import { describe, expect, it } from 'vitest';
import { Manifest } from './v2.ts';
import { Permissions } from './permissions.ts';

const torrents = {
  net: {
    connect: [
      { purpose: 'peers', to: ['public'], proto: ['tcp'] },
      { purpose: 'torrent-file', to: ['public', 'lan'], ports: [80, 443] },
      { purpose: 'seal-check', to: ['setting:vpnCheckUrl'] },
      { purpose: 'metadata', to: ['*.themoviedb.org'] },
    ],
    listen: [{ purpose: 'peers', port: 'setting:rqbitPort' }],
  },
  fs: { read: ['media'], write: ['module', 'downloads'] },
  run: ['ffmpeg'],
  env: ['KROMA_EMBED_MODEL_DIR'],
};

describe('Permissions', () => {
  it('reads a complete declaration', () => {
    expect(Permissions.parse(torrents)).toEqual(torrents);
  });

  it('refuses a misspelt permission rather than ignoring it', () => {
    expect(() => Permissions.parse({ network: {} })).toThrow();
    expect(() => Permissions.parse({ net: { conect: [] } })).toThrow();
    expect(() =>
      Permissions.parse({ net: { connect: [{ purpose: 'p', to: ['public'], port: [1] }] } }),
    ).toThrow();
  });

  it('refuses a raw path, an unknown protocol or a destination it cannot read', () => {
    expect(() => Permissions.parse({ fs: { read: ['/etc'] } })).toThrow();
    expect(() =>
      Permissions.parse({ net: { connect: [{ purpose: 'p', to: ['public'], proto: ['icmp'] }] } }),
    ).toThrow();
    expect(() =>
      Permissions.parse({ net: { connect: [{ purpose: 'p', to: ['anywhere'] }] } }),
    ).toThrow();
    expect(() => Permissions.parse({ net: { connect: [{ purpose: 'p', to: [] }] } })).toThrow();
  });

  it('refuses a binary given as a path and a variable that is not a name', () => {
    expect(() => Permissions.parse({ run: ['/usr/bin/curl'] })).toThrow();
    expect(() => Permissions.parse({ env: ['path'] })).toThrow();
  });

  it('is optional in a manifest, which keeps an older module readable', () => {
    const base = { id: 'tv.kroma.x', name: 'X', version: '1.0.0' };

    expect(Manifest.parse(base).permissions).toBeUndefined();
    expect(Manifest.parse({ ...base, permissions: torrents }).permissions).toEqual(torrents);
  });
});
