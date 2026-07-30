import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DISCOVERY_CANDIDATES,
  discoverServer,
  discoverServers,
  getLocalIPv4,
  resolveServerOrigin,
  subnetCandidates,
} from './discover';

// A fetch stub driven by a URL -> health-body map; a URL absent from the map is
// a dead host.
type Health = {
  ok?: boolean;
  status?: string;
  throws?: boolean;
  body?: Record<string, unknown>;
  url?: string;
};
function fakeFetch(map: Record<string, Health>): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const h = map[url];
    if (!h) return { ok: false, url, json: async () => ({}) } as Response;
    return {
      ok: h.ok ?? true,
      url: h.url ?? url,
      json: async () => {
        if (h.throws) throw new Error('bad json');
        return { status: h.status ?? 'ok', ...h.body };
      },
    } as Response;
  }) as unknown as typeof globalThis.fetch;
}

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

describe('getLocalIPv4', () => {
  afterEach(() => {
    for (const key of ['tizen', 'webOS', 'RTCPeerConnection']) {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('resolves null when no platform network API is available (node)', async () => {
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  // Tizen's `getPropertyValue(prop, onSuccess, onError)`. Wi-Fi is asked first: a
  // set that is plugged in AND associated answers both.
  function tizenWith(answers: Record<string, { ipAddress?: string } | 'error'>) {
    (globalThis as Record<string, unknown>).tizen = {
      systeminfo: {
        getPropertyValue(
          prop: string,
          onSuccess: (v: { ipAddress?: string }) => void,
          onError: () => void,
        ) {
          const a = answers[prop];
          if (a === undefined || a === 'error') onError();
          else onSuccess(a);
        },
      },
    };
  }

  it('takes the Tizen Wi-Fi address when there is one', async () => {
    tizenWith({ WIFI_NETWORK: { ipAddress: '192.168.1.42' } });
    await expect(getLocalIPv4()).resolves.toBe('192.168.1.42');
  });

  it('falls back to Tizen Ethernet when Wi-Fi is unset', async () => {
    // 0.0.0.0 is what an idle Tizen radio reports, and it is not an address.
    tizenWith({
      WIFI_NETWORK: { ipAddress: '0.0.0.0' },
      ETHERNET_NETWORK: { ipAddress: '10.0.0.7' },
    });
    await expect(getLocalIPv4()).resolves.toBe('10.0.0.7');
  });

  it('falls back to Tizen Ethernet when the Wi-Fi query itself fails', async () => {
    tizenWith({ WIFI_NETWORK: 'error', ETHERNET_NETWORK: { ipAddress: '10.0.0.8' } });
    await expect(getLocalIPv4()).resolves.toBe('10.0.0.8');
  });

  it('resolves null when neither Tizen interface answers', async () => {
    tizenWith({ WIFI_NETWORK: 'error', ETHERNET_NETWORK: 'error' });
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  it('survives a Tizen bridge that throws outright', async () => {
    (globalThis as Record<string, unknown>).tizen = {
      systeminfo: {
        getPropertyValue() {
          throw new Error('systeminfo unavailable');
        },
      },
    };
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  function webOsWith(res: unknown, fail = false) {
    (globalThis as Record<string, unknown>).webOS = {
      service: {
        request(_uri: string, opts: { onSuccess: (r: unknown) => void; onFailure: () => void }) {
          if (fail) opts.onFailure();
          else opts.onSuccess(res);
        },
      },
    };
  }

  it('prefers the webOS wired address over the wireless one', async () => {
    webOsWith({ wired: { ipAddress: '10.1.1.5' }, wifi: { ipAddress: '192.168.0.9' } });
    await expect(getLocalIPv4()).resolves.toBe('10.1.1.5');
  });

  it('uses the webOS wifi address when there is no wired one', async () => {
    webOsWith({ wifi: { ipAddress: '192.168.0.9' } });
    await expect(getLocalIPv4()).resolves.toBe('192.168.0.9');
  });

  it('resolves null when the webOS request fails', async () => {
    webOsWith(null, true);
    await expect(getLocalIPv4()).resolves.toBeNull();
  });

  function rtcEmitting(candidates: (string | null)[]) {
    (globalThis as Record<string, unknown>).RTCPeerConnection = class {
      onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
      createDataChannel() {}
      close() {}
      setLocalDescription() {}
      async createOffer() {
        queueMicrotask(() => {
          for (const c of candidates) {
            this.onicecandidate?.({ candidate: c === null ? null : { candidate: c } });
          }
        });
        return {};
      }
    };
  }

  it('reads a private IPv4 out of an ICE candidate', async () => {
    rtcEmitting(['candidate:1 1 udp 2113 192.168.4.21 54321 typ host']);
    await expect(getLocalIPv4()).resolves.toBe('192.168.4.21');
  });

  it('ignores mDNS-obfuscated and public candidates', async () => {
    // `.local` carries no address, and a reflexive address is the router's, not
    // this device's - neither can seed a subnet scan.
    rtcEmitting([
      'candidate:1 1 udp 2113 9f8e.local 54321 typ host',
      'candidate:2 1 udp 1686 203.0.113.7 54321 typ srflx',
      'candidate:3 1 udp 2113 172.16.3.9 54321 typ host',
    ]);
    await expect(getLocalIPv4()).resolves.toBe('172.16.3.9');
  });

  it('resolves null when the peer connection cannot be built', async () => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = class {
      constructor() {
        throw new Error('no webrtc');
      }
    };
    await expect(getLocalIPv4()).resolves.toBeNull();
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
});

describe('resolveServerOrigin', () => {
  const H = '/api/health';

  it('prefers TLS on the standard port for a bare host', async () => {
    const fetch = fakeFetch({
      [`https://media.example.net${H}`]: {},
      [`http://media.example.net${H}`]: {},
    });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it("falls back to this project's own port when the standard ones are dead", async () => {
    const fetch = fakeFetch({ [`http://media.example.net:4040${H}`]: {} });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'http://media.example.net:4040',
      secure: false,
    });
  });

  // A plain-http probe SUCCEEDS against a server that redirects, so only the
  // final URL can be trusted for the padlock.
  it('reports https when http redirects to it', async () => {
    const fetch = fakeFetch({
      [`http://media.example.net${H}`]: { url: `https://media.example.net${H}` },
    });
    expect(await resolveServerOrigin('media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net',
      secure: true,
    });
  });

  it('honours an explicit scheme and port exactly', async () => {
    const fetch = fakeFetch({ [`https://media.example.net:8443${H}`]: {} });
    expect(await resolveServerOrigin('https://media.example.net:8443', { fetch })).toEqual({
      url: 'https://media.example.net:8443',
      secure: true,
    });
  });

  it('tries 4040 for an explicit scheme with no port', async () => {
    const fetch = fakeFetch({ [`https://media.example.net:4040${H}`]: {} });
    expect(await resolveServerOrigin('https://media.example.net', { fetch })).toEqual({
      url: 'https://media.example.net:4040',
      secure: true,
    });
  });

  it('never swaps a typed scheme for the other one', async () => {
    const fetch = fakeFetch({ [`https://media.example.net${H}`]: {} });
    expect(await resolveServerOrigin('http://media.example.net', { fetch })).toBeNull();
  });

  it('is null when nothing answers, which is not the same as insecure', async () => {
    expect(await resolveServerOrigin('media.example.net', { fetch: fakeFetch({}) })).toBeNull();
  });

  it('ignores an empty address', async () => {
    expect(await resolveServerOrigin('   ', { fetch: fakeFetch({}) })).toBeNull();
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
