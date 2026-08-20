import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY_CANDIDATES,
  discoverServer,
  discoverServers,
  resolveServerOrigin,
  subnetCandidates,
} from './discover';
import { fakeFetch, hangingFetch } from './health-probe.fixture';

describe('subnetCandidates', () => {
  it('emits every /24 host except the device itself', () => {
    const hosts = subnetCandidates('192.168.1.5');
    expect(hosts).toHaveLength(253); // 254 usable minus self
    expect(hosts).toContain('http://192.168.1.1:4040');
    expect(hosts).toContain('http://192.168.1.254:4040');
    expect(hosts).not.toContain('http://192.168.1.5:4040');
  });

  it('honours a custom port and skips the self address', () => {
    const hosts = subnetCandidates('10.0.0.1', 8080);
    expect(hosts).toHaveLength(253);
    expect(hosts[0]).toBe('http://10.0.0.2:8080'); // .1 is self, so .2 is first
    expect(hosts).not.toContain('http://10.0.0.1:8080');
  });

  it('returns an empty list for a malformed IP', () => {
    expect(subnetCandidates('not-an-ip')).toEqual([]);
    expect(subnetCandidates('192.168.1')).toEqual([]);
  });
});

describe('a runtime with no fetch', () => {
  it('gives up rather than throwing', async () => {
    const real = globalThis.fetch;
    (globalThis as { fetch?: typeof globalThis.fetch }).fetch = undefined;
    try {
      await expect(discoverServer()).resolves.toBeNull();
      await expect(discoverServers()).resolves.toEqual([]);
      await expect(resolveServerOrigin('kroma.local')).resolves.toBeNull();
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('discoverServer', () => {
  it('returns the first live named candidate', async () => {
    const fetch = fakeFetch({ 'http://host:4040/api/health': { status: 'ok' } });
    await expect(
      discoverServer({ candidates: ['http://host:4040'], scanSubnet: false, fetch }),
    ).resolves.toBe('http://host:4040');
  });

  it('strips a trailing slash from the returned origin', async () => {
    const fetch = fakeFetch({ 'http://host:4040/api/health': { status: 'ok' } });
    await expect(
      discoverServer({ candidates: ['http://host:4040/'], scanSubnet: false, fetch }),
    ).resolves.toBe('http://host:4040');
  });

  it('skips a dead candidate and returns the next live one', async () => {
    const fetch = fakeFetch({
      'http://a:4040/api/health': { ok: false },
      'http://b:4040/api/health': { status: 'ok' },
    });
    await expect(
      discoverServer({ candidates: ['http://a:4040', 'http://b:4040'], scanSubnet: false, fetch }),
    ).resolves.toBe('http://b:4040');
  });

  it('treats a non-ok status body as not-a-server', async () => {
    const fetch = fakeFetch({ 'http://host:4040/api/health': { status: 'starting' } });
    await expect(
      discoverServer({ candidates: ['http://host:4040'], scanSubnet: false, fetch }),
    ).resolves.toBeNull();
  });

  it('treats a health body that answers off-contract as not-a-server', async () => {
    const fetch = fakeFetch({
      'http://host:4040/api/health': { body: { name: { evil: true }, version: 3 } },
    });
    await expect(
      discoverServer({ candidates: ['http://host:4040'], scanSubnet: false, fetch }),
    ).resolves.toBeNull();
  });

  it('treats a malformed JSON body as not-a-server', async () => {
    const fetch = fakeFetch({ 'http://host:4040/api/health': { throws: true } });
    await expect(
      discoverServer({ candidates: ['http://host:4040'], scanSubnet: false, fetch }),
    ).resolves.toBeNull();
  });

  it('resolves null when no candidate answers and the subnet scan finds no local IP', async () => {
    const fetch = fakeFetch({});
    // scanSubnet defaults to true, but node has no local-IP API so it is skipped.
    await expect(discoverServer({ candidates: ['http://dead:4040'], fetch })).resolves.toBeNull();
  });

  it('probes the default candidate when none is supplied', async () => {
    const base = DEFAULT_DISCOVERY_CANDIDATES[0];
    const fetch = fakeFetch({ [`${base}/api/health`]: { status: 'ok' } });
    await expect(discoverServer({ scanSubnet: false, fetch })).resolves.toBe(base);
  });

  it('resolves null with no candidates and scanning disabled', async () => {
    const fetch = fakeFetch({});
    await expect(discoverServer({ candidates: [], scanSubnet: false, fetch })).resolves.toBeNull();
  });

  it('sweeps the /24 around the local address when no candidate answers', async () => {
    const fetch = fakeFetch({ 'http://192.168.1.9:4040/api/health': {} });
    await expect(
      discoverServer({ candidates: ['http://dead:4040'], localIp: '192.168.1.5', fetch }),
    ).resolves.toBe('http://192.168.1.9:4040');
  });

  it('resolves null when the sweep finds nothing either', async () => {
    await expect(
      discoverServer({ candidates: [], localIp: '192.168.1.5', fetch: fakeFetch({}) }),
    ).resolves.toBeNull();
  });

  it('abandons a candidate that accepts the connection and never answers', async () => {
    await expect(
      discoverServer({
        candidates: ['http://slow:4040'],
        scanSubnet: false,
        fetch: hangingFetch,
        timeoutMs: 0,
      }),
    ).resolves.toBeNull();
  });
});

describe('discoverServers', () => {
  it('collects every live server across candidates and the subnet scan', async () => {
    const fetch = fakeFetch({
      'http://kroma.local:4040/api/health': {
        body: { name: 'Salon', version: '1', libraries: 2, items: 10, shows: 3 },
      },
      'http://10.0.0.7:4040/api/health': {
        body: { name: 'Chambre', version: '1', libraries: 1, items: 4, shows: 1 },
      },
    });
    const found = await discoverServers({
      candidates: ['http://kroma.local:4040'],
      localIp: '10.0.0.2',
      fetch,
    });
    expect(found.map((f) => f.url)).toEqual(['http://kroma.local:4040', 'http://10.0.0.7:4040']);
    expect(found.map((f) => f.name)).toEqual(['Salon', 'Chambre']);
  });

  it('drops a host whose name is not a name rather than listing it', async () => {
    const fetch = fakeFetch({
      'http://kroma.local:4040/api/health': { body: { name: ['Salon'], version: '1' } },
    });
    const found = await discoverServers({
      candidates: ['http://kroma.local:4040'],
      scanSubnet: false,
      fetch,
    });
    expect(found).toEqual([]);
  });

  it('collapses the same server reached via mDNS name and IP, keeping the first origin', async () => {
    const identity = { instanceId: 'abc', name: 'Salon', version: '1', libraries: 2 };
    const fetch = fakeFetch({
      'http://kroma.local:4040/api/health': { body: identity },
      // The same install by IP, answering with a different NAME: the server only
      // labels LAN callers.
      'http://10.0.0.7:4040/api/health': { body: { ...identity, name: undefined } },
    });
    const found = await discoverServers({
      candidates: ['http://kroma.local:4040'],
      localIp: '10.0.0.2',
      fetch,
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('http://kroma.local:4040');
  });

  it('keeps two DISTINCT servers whose health bodies are otherwise identical', async () => {
    const fresh = { name: 'KROMA', version: '1', libraries: 0, items: 0, shows: 0 };
    const fetch = fakeFetch({
      'http://10.0.0.7:4040/api/health': { body: { ...fresh, instanceId: 'one' } },
      'http://10.0.0.9:4040/api/health': { body: { ...fresh, instanceId: 'two' } },
    });
    const found = await discoverServers({ candidates: [], localIp: '10.0.0.2', fetch });
    expect(found.map((f) => f.url)).toEqual(['http://10.0.0.7:4040', 'http://10.0.0.9:4040']);
    expect(found.map((f) => f.instanceId)).toEqual(['one', 'two']);
  });

  it('still collapses pre-instanceId servers on their health fingerprint', async () => {
    const legacy = { name: 'Salon', version: '1', libraries: 2, items: 10, shows: 3 };
    const fetch = fakeFetch({
      'http://kroma.local:4040/api/health': { body: legacy },
      'http://10.0.0.7:4040/api/health': { body: legacy },
    });
    const found = await discoverServers({
      candidates: ['http://kroma.local:4040'],
      localIp: '10.0.0.2',
      fetch,
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.url).toBe('http://kroma.local:4040');
  });

  it('resolves empty when nothing answers', async () => {
    const found = await discoverServers({
      candidates: ['http://dead:4040'],
      scanSubnet: false,
      fetch: fakeFetch({}),
    });
    expect(found).toEqual([]);
  });

  it('skips the sweep entirely when the device has no local address', async () => {
    const fetch = fakeFetch({
      'http://kroma.local:4040/api/health': { body: { instanceId: 'salon' } },
    });
    const found = await discoverServers({ fetch });
    expect(found.map((f) => f.url)).toEqual(['http://kroma.local:4040']);
  });
});
describe('discovery via the DNS-SD browse', () => {
  const H = '/api/health';

  it('prefers an announced server over the named candidate', async () => {
    const fetch = fakeFetch({
      [`http://kroma.local:4040${H}`]: {},
      [`http://announced.local:9000${H}`]: {},
    });
    const browse = async () => [{ host: 'announced.local', port: 9000 }];
    await expect(discoverServer({ browse, scanSubnet: false, fetch })).resolves.toBe(
      'http://announced.local:9000',
    );
  });

  it('finds a server on a port nothing would have guessed', async () => {
    const fetch = fakeFetch({ [`https://media.local:8443${H}`]: {} });
    const browse = async () => [{ host: 'media.local', port: 8443 }];
    await expect(discoverServer({ browse, scanSubnet: false, fetch })).resolves.toBe(
      'https://media.local:8443',
    );
  });

  it('falls back to the named candidate when the browse finds nothing', async () => {
    const fetch = fakeFetch({ [`http://kroma.local:4040${H}`]: {} });
    const browse = async () => [];
    await expect(discoverServer({ browse, scanSubnet: false, fetch })).resolves.toBe(
      'http://kroma.local:4040',
    );
  });

  it('falls back when the browse throws', async () => {
    const fetch = fakeFetch({ [`http://kroma.local:4040${H}`]: {} });
    const browse = async () => {
      throw new Error('no multicast on this network');
    };
    await expect(discoverServer({ browse, scanSubnet: false, fetch })).resolves.toBe(
      'http://kroma.local:4040',
    );
  });

  it('ignores an announced server that does not actually answer', async () => {
    const fetch = fakeFetch({ [`http://kroma.local:4040${H}`]: {} });
    const browse = async () => [{ host: 'ghost.local', port: 4040 }];
    await expect(discoverServer({ browse, scanSubnet: false, fetch })).resolves.toBe(
      'http://kroma.local:4040',
    );
  });

  it('lists announced servers first in discoverServers', async () => {
    const fetch = fakeFetch({
      [`http://kroma.local:4040${H}`]: { body: { instanceId: 'named' } },
      [`http://announced.local:9000${H}`]: { body: { instanceId: 'announced' } },
    });
    const browse = async () => [{ host: 'announced.local', port: 9000 }];
    const found = await discoverServers({ browse, scanSubnet: false, fetch });
    expect(found.map((f) => f.url)).toEqual([
      'http://announced.local:9000',
      'http://kroma.local:4040',
    ]);
  });
});
