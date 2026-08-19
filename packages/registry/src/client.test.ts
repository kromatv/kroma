import { describe, expect, it } from 'vitest';
import { createRegistryClient, matches, pickVersion, verifyIntegrity } from './client.ts';
import type { ModuleRecord, RegistryEntry } from './documents/index.ts';

const sri = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
};

describe('pickVersion', () => {
  it('returns the highest satisfying version', () => {
    expect(pickVersion(['0.1.0', '0.1.9', '0.1.10', '0.2.0'], '^0.1.0')).toBe('0.1.10');
  });

  it('returns null when nothing satisfies', () => {
    expect(pickVersion(['0.1.0', '0.2.0'], '^0.3.0')).toBeNull();
  });

  it('never picks a pre-release for a stable range', () => {
    expect(pickVersion(['0.1.0', '0.2.0-beta.1'], '*')).toBe('0.1.0');
  });
});

describe('verifyIntegrity', () => {
  const bytes = new TextEncoder().encode('hello');

  it('accepts matching bytes and rejects tampered ones', async () => {
    const good = await sri('hello');
    expect(await verifyIntegrity(bytes, good)).toBe(true);
    expect(await verifyIntegrity(new TextEncoder().encode('hell0'), good)).toBe(false);
  });

  it('rejects a non-sha256 or malformed integrity', async () => {
    expect(await verifyIntegrity(bytes, 'md5-abc')).toBe(false);
    expect(await verifyIntegrity(bytes, 'nonsense')).toBe(false);
    expect(await verifyIntegrity(bytes, 'sha256-')).toBe(false);
  });
});

describe('matches', () => {
  const entry = {
    id: 'tv.kroma.vpn',
    name: 'VPN',
    description: 'Routes the download engine through a tunnel.',
    keywords: ['wireguard'],
    tags: ['network'],
  };

  it('reads the id, name, description, keywords and tags, case-insensitively', () => {
    for (const q of ['vpn', 'KROMA.VPN', 'tunnel', 'WireGuard', 'network']) {
      expect(matches(entry, q), q).toBe(true);
    }
    expect(matches(entry, 'whisper')).toBe(false);
  });

  it('still searches a module described with nothing at all', () => {
    const bare = { id: 'tv.kroma.vpn', name: 'VPN' };
    expect(matches(bare, 'vpn')).toBe(true);
    expect(matches(bare, 'tunnel')).toBe(false);
  });

  it('keeps everything for an empty or blank query', () => {
    expect(matches(entry, '')).toBe(true);
    expect(matches(entry, '   ')).toBe(true);
  });
});

describe('createRegistryClient', () => {
  const artifact = {
    target: 'x86_64-unknown-linux-musl',
    url: 'https://h/x.kmod',
    size: 10,
    integrity: `sha256-${'A'.repeat(43)}=`,
  };
  const record: ModuleRecord = {
    apiVersion: 1,
    id: 'tv.kroma.torrents',
    name: 'Torrents',
    latest: '0.1.9',
    distTags: { latest: '0.1.9', beta: '0.2.0-beta.1' },
    versions: {
      '0.1.0': { artifacts: [artifact] },
      '0.1.9': { engines: { server: '>=0.1.4' }, artifacts: [artifact] },
      '0.2.0-beta.1': { artifacts: [artifact] },
    },
  };
  const index: RegistryEntry[] = [
    {
      id: 'tv.kroma.torrents',
      name: 'Torrents',
      version: '0.1.9',
      keywords: ['download'],
      artifacts: [artifact],
    },
    {
      id: 'tv.kroma.remote',
      name: 'Remote',
      version: '0.1.2',
      tags: ['remote-access'],
      artifacts: [artifact],
    },
  ];
  const descriptor = {
    apiVersion: 1,
    name: 'KROMA modules',
    url: 'https://r',
    modules: ['tv.kroma.remote', 'tv.kroma.torrents'],
  };

  const seen: string[] = [];
  const fetchJson = async (url: string) => {
    seen.push(url);
    if (url.endsWith('/registry.json')) return descriptor;
    if (url.endsWith('/m/tv.kroma.torrents.json')) return record;
    if (url.endsWith('/index.json')) return index;
    throw new Error(`unexpected ${url}`);
  };
  const client = createRegistryClient('https://r/', fetchJson);

  it('reads the three documents off the base url', async () => {
    await client.descriptor();
    await client.index();
    await client.module('tv.kroma.torrents');
    expect(seen).toEqual([
      'https://r/registry.json',
      'https://r/index.json',
      'https://r/m/tv.kroma.torrents.json',
    ]);
  });

  it('resolves a range to the highest matching version', async () => {
    const out = await client.resolve('tv.kroma.torrents', '^0.1.0');
    expect(out?.version).toBe('0.1.9');
    expect(out?.release.engines).toEqual({ server: '>=0.1.4' });
  });

  it('resolves to null when no version matches', async () => {
    expect(await client.resolve('tv.kroma.torrents', '^9.0.0')).toBeNull();
  });

  it('resolves a channel to its version, and a stable range never reaches the beta', async () => {
    expect((await client.resolve('tv.kroma.torrents', 'beta'))?.version).toBe('0.2.0-beta.1');
    expect((await client.resolve('tv.kroma.torrents', 'latest'))?.version).toBe('0.1.9');
    expect((await client.resolve('tv.kroma.torrents', '^0.1.0'))?.version).toBe('0.1.9');
  });

  it('searches the index by id, name, keyword or tag', async () => {
    expect((await client.search('download')).map((e) => e.id)).toEqual(['tv.kroma.torrents']);
    expect((await client.search('remote-access')).map((e) => e.id)).toEqual(['tv.kroma.remote']);
    expect(await client.search('')).toHaveLength(2);
  });

  it('rejects a document a hostile registry malformed', async () => {
    const bad = createRegistryClient('https://r', async () => ({ id: 'x' }));
    await expect(bad.module('tv.kroma.torrents')).rejects.toThrow();
    await expect(bad.descriptor()).rejects.toThrow();
  });

  it('rejects an artifact whose integrity is missing or not an sha256 SRI', async () => {
    const bad = createRegistryClient('https://r', async () => ({
      ...record,
      versions: { '0.1.9': { artifacts: [{ ...artifact, integrity: 'sha256-nope' }] } },
    }));
    await expect(bad.module('tv.kroma.torrents')).rejects.toThrow();
  });

  it('refuses a registry speaking a newer contract rather than half-reading it', async () => {
    const future = createRegistryClient('https://r', async () => ({
      ...descriptor,
      apiVersion: 2,
    }));
    await expect(future.descriptor()).rejects.toThrow(/apiVersion 2/);
  });

  it('refuses an id that would walk out of /m/', async () => {
    await expect(client.module('../../etc/passwd')).rejects.toThrow(/not a module id/);
  });
});
