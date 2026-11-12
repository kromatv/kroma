import { describe, expect, it } from 'vitest';
import { Manifest, speaksCurrentSchema } from './v3.ts';

const base = { schemaVersion: 3, id: 'tv.kroma.x', name: 'X', version: '1.0.0' };

const SHA = 'ab'.repeat(32);

const wireproxy = {
  assets: {
    'linux-x86_64': {
      url: 'https://github.com/windtf/wireproxy/releases/download/v1.1.2/linux_amd64.tar.gz',
      sha256: SHA,
      member: 'wireproxy',
    },
    'macos-aarch64': {
      url: 'https://github.com/windtf/wireproxy/releases/download/v1.1.2/darwin_arm64.tar.gz',
      sha256: SHA,
    },
  },
};

describe('speaksCurrentSchema', () => {
  it('is true for schema 3 alone', () => {
    expect(speaksCurrentSchema({ schemaVersion: 3 })).toBe(true);
  });

  it('is false for the native schema before it, the one after it, and none at all', () => {
    expect(speaksCurrentSchema({ schemaVersion: 2 })).toBe(false);
    expect(speaksCurrentSchema({ schemaVersion: 1 })).toBe(false);
    expect(speaksCurrentSchema({ schemaVersion: 4 })).toBe(false);
    expect(speaksCurrentSchema({ schemaVersion: undefined })).toBe(false);
  });
});

describe('seam', () => {
  it('is not part of a component manifest, so a stray one is not carried', () => {
    const parsed = Manifest.parse({ ...base, seam: 'unix' });

    expect(parsed).not.toHaveProperty('seam');
  });

  it('is refused outright where a manifest is read strictly', () => {
    expect(() => Manifest.strict().parse({ ...base, seam: 'unix' })).toThrow(/seam/);
  });
});

describe('helpers', () => {
  it('keeps each program by name, one pinned build per platform', () => {
    const parsed = Manifest.parse({ ...base, helpers: { wireproxy } });

    expect(parsed.helpers).toEqual({ wireproxy });
  });

  it('is absent for a module that runs no upstream program', () => {
    expect(Manifest.parse(base).helpers).toBeUndefined();
  });

  it('refuses a platform that is not <os>-<arch>', () => {
    const asset = wireproxy.assets['linux-x86_64'];
    const helpers = { wireproxy: { assets: { 'Linux x86_64': asset } } };

    expect(() => Manifest.parse({ ...base, helpers })).toThrow();
  });

  it('refuses a build with no sha256 to verify it by, or one that is not hex', () => {
    const at = (sha256: string) => ({
      wireproxy: { assets: { 'linux-x86_64': { url: 'https://h/w.tar.gz', sha256 } } },
    });

    expect(() => Manifest.parse({ ...base, helpers: at('') })).toThrow();
    expect(() => Manifest.parse({ ...base, helpers: at('z'.repeat(64)) })).toThrow();
  });

  it('refuses a key it does not know inside a build', () => {
    const asset = { ...wireproxy.assets['linux-x86_64'], mode: '0755' };
    const helpers = { wireproxy: { assets: { 'linux-x86_64': asset } } };

    expect(() => Manifest.parse({ ...base, helpers })).toThrow();
  });
});

describe('component', () => {
  it('keeps what a module asks of the host beyond the default', () => {
    const component = { instances: 8, memoryMib: 1024, cpuSeconds: 120 };

    expect(Manifest.parse({ ...base, component }).component).toEqual(component);
  });

  it('is absent for a module the defaults suit', () => {
    expect(Manifest.parse(base).component).toBeUndefined();
  });

  it('refuses no instance at all and more than sixteen', () => {
    expect(() => Manifest.parse({ ...base, component: { instances: 0 } })).toThrow();
    expect(() => Manifest.parse({ ...base, component: { instances: 17 } })).toThrow();
    expect(Manifest.parse({ ...base, component: { instances: 16 } }).component?.instances).toBe(16);
  });

  it('refuses a key it does not know', () => {
    expect(() => Manifest.parse({ ...base, component: { threads: 4 } })).toThrow();
  });
});

describe('dataDirs', () => {
  it('keeps the directory names a module declares', () => {
    expect(Manifest.parse({ ...base, dataDirs: ['scene', 'cache_v2'] }).dataDirs).toEqual([
      'scene',
      'cache_v2',
    ]);
  });

  it('refuses a name that would reach outside the data directory', () => {
    expect(() => Manifest.parse({ ...base, dataDirs: ['../etc'] })).toThrow();
    expect(() => Manifest.parse({ ...base, dataDirs: ['a/b'] })).toThrow();
  });
});

describe('the shape a real manifest declares', () => {
  const full = {
    $schema: 'https://modules.kroma.tv/schemas/3/manifest.json',
    schemaVersion: 3,
    id: 'tv.kroma.vpn',
    name: 'VPN',
    version: '0.5.0',
    description: 'WireGuard egress',
    engines: { server: '>=0.1.40' },
    library: false,
    dependencies: { 'tv.kroma.indexer': '^0.4.0' },
    contributes: [{ point: 'tv.kroma.torrents/egress', version: 1, id: 'wireguard' }],
    consumes: [{ point: 'tv.kroma.indexer/search', version: '^1' }],
    settings: { read: ['vpnWgConfig'], write: ['vpnWgConfig'] },
    dataDirs: ['vpn'],
    helpers: { wireproxy },
    component: { instances: 1, memoryMib: 256 },
  };

  it('keeps every one of them', () => {
    expect(Manifest.parse(full)).toEqual(full);
  });
});
