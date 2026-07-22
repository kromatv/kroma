// LAN auto-discovery for the KROMA server.
//
// Browsers / TV webviews can't browse mDNS from JavaScript. Two strategies,
// tried in order:
//   1. Named candidates `http://kroma.local:4040` (works where the client OS
//      resolves the mDNS `.local` hostname the server advertises: desktop,
//      mobile; NOT Samsung Tizen).
//   2. Subnet scan get this device's own LAN IP (Tizen/webOS system API, or a
//      WebRTC trick) and probe every host on its /24 for `/api/health`. This is
//      what makes discovery work on a TV with no mDNS resolution.
// The first server to answer `{ status: "ok" }` wins.

export interface DiscoverOptions {
  /** Named origins probed first. Default: `http://kroma.local:4040`. */
  candidates?: string[];
  /** Per-probe timeout (ms). Default 2000. */
  timeoutMs?: number;
  /** Scan the local /24 if the named candidates miss. Default true. */
  scanSubnet?: boolean;
  /** Server port to scan for. Default 4040. */
  port?: number;
  /** Max concurrent probes during a subnet scan. Default 48. */
  concurrency?: number;
  /** This device's LAN IPv4, for platforms whose runtime cannot derive it
   * (React Native); tried before the built-in per-platform resolvers. */
  localIp?: string;
  fetch?: typeof globalThis.fetch;
}

export const DEFAULT_DISCOVERY_CANDIDATES = ['http://kroma.local:4040'];

/** Probe candidates, then (optionally) the local subnet; resolve the first live
 *  KROMA server origin, or `null`. */
export async function discoverServer(opts: DiscoverOptions = {}): Promise<string | null> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const port = opts.port ?? 4040;

  // 1) Named candidates (mDNS hostname / baked default).
  const named = (opts.candidates ?? DEFAULT_DISCOVERY_CANDIDATES).map(stripTrailingSlash);
  const namedHit = await raceForServer(named, fetchFn, opts.timeoutMs ?? 2000);
  if (namedHit) return namedHit;

  // 2) Subnet scan needs this device's own LAN IP.
  if (opts.scanSubnet !== false) {
    const ip = opts.localIp ?? (await getLocalIPv4());
    if (ip) {
      const hosts = subnetCandidates(ip, port);
      const scanHit = await raceForServer(
        hosts,
        fetchFn,
        opts.timeoutMs ?? 1500,
        opts.concurrency ?? 48,
      );
      if (scanHit) return scanHit;
    }
  }
  return null;
}

/** One server found by [`discoverServers`]: its origin plus the identity bits
 *  of its `/api/health` answer. */
export interface DiscoveredServer {
  url: string;
  /** Admin-configured server name (absent on servers predating it, and on
   *  servers that classify this client as WAN). */
  name?: string;
  version?: string;
  /** Stable per-install id (absent on servers predating it). */
  instanceId?: string;
}

/** The identity two answers must share to be "the same server". Servers mint a
 *  stable `instanceId`; only when talking to one too old to send it do we fall
 *  back to a content fingerprint, which is a guess (two fresh installs are both
 *  "KROMA", same version, 0 libraries) - so the fallback is namespaced and left
 *  deliberately unable to collide with a real id. */
function identityOf(body: HealthBody): string {
  if (body.instanceId) return `id:${body.instanceId}`;
  return `fp:${[body.name, body.version, body.libraries, body.items, body.shows].join('|')}`;
}

/** Probe candidates AND the whole local subnet; resolve EVERY live KROMA
 *  server. Duplicate answers for the same server (e.g. its mDNS name and its
 *  IP) are collapsed on [`identityOf`], keeping the first origin. Both sweeps
 *  run concurrently: a `.local` candidate that no resolver answers burns its
 *  full timeout, and the subnet has no reason to wait for it. */
export async function discoverServers(opts: DiscoverOptions = {}): Promise<DiscoveredServer[]> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return [];
  const port = opts.port ?? 4040;

  const named = (opts.candidates ?? DEFAULT_DISCOVERY_CANDIDATES).map(stripTrailingSlash);
  const subnet = async () => {
    if (opts.scanSubnet === false) return [];
    const ip = opts.localIp ?? (await getLocalIPv4());
    if (!ip) return [];
    return probeAll(
      subnetCandidates(ip, port),
      fetchFn,
      opts.timeoutMs ?? 1500,
      opts.concurrency ?? 48,
    );
  };
  // Named candidates stay FIRST in the result so a friendly `.local` origin wins
  // over the bare IP for the same server.
  const [namedHits, subnetHits] = await Promise.all([
    probeAll(named, fetchFn, opts.timeoutMs ?? 2000, named.length),
    subnet(),
  ]);

  const seen = new Set<string>();
  const found: DiscoveredServer[] = [];
  for (const hit of [...namedHits, ...subnetHits]) {
    const key = identityOf(hit.body);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      url: hit.url,
      name: hit.body.name,
      version: hit.body.version,
      instanceId: hit.body.instanceId,
    });
  }
  return found;
}

/** All `http://<prefix>.1..254:<port>` origins for the /24 containing `ip`
 *  (excluding the device's own address). */
export function subnetCandidates(ip: string, port = 4040): string[] {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return [];
  const prefix = m[1];
  const self = Number(m[2]);
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) {
    if (i !== self) hosts.push(`http://${prefix}.${i}:${port}`);
  }
  return hosts;
}

/** Best-effort local IPv4: Tizen/webOS network APIs, then a WebRTC fallback. */
export async function getLocalIPv4(): Promise<string | null> {
  return (await tizenLocalIp()) ?? (await webosLocalIp()) ?? (await webrtcLocalIp());
}

// ----- per-platform local IP --------------------------------------------------

/** Wrap a resolver so only the first call settles it (later calls are ignored). */
function once<T>(resolve: (value: T) => void): (value: T) => void {
  let settled = false;
  return (value: T) => {
    if (!settled) {
      settled = true;
      resolve(value);
    }
  };
}

function tizenLocalIp(): Promise<string | null> {
  const tizen = (globalThis as { tizen?: TizenSystemInfo }).tizen;
  const si = tizen?.systeminfo;
  if (!si?.getPropertyValue) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = once(resolve);
    const good = (ip?: string) => (ip && ip !== '0.0.0.0' ? ip : null);
    try {
      si.getPropertyValue(
        'WIFI_NETWORK',
        (w) => {
          const ip = good(w?.ipAddress);
          if (ip) return finish(ip);
          si.getPropertyValue(
            'ETHERNET_NETWORK',
            (e) => finish(good(e?.ipAddress)),
            () => finish(null),
          );
        },
        () =>
          si.getPropertyValue(
            'ETHERNET_NETWORK',
            (e) => finish(good(e?.ipAddress)),
            () => finish(null),
          ),
      );
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function webosLocalIp(): Promise<string | null> {
  const svc = (globalThis as { webOS?: WebOSBridge }).webOS?.service;
  if (!svc?.request) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = once(resolve);
    try {
      svc.request('luna://com.palm.connectionmanager', {
        method: 'getStatus',
        parameters: {},
        onSuccess: (res) => finish(res?.wired?.ipAddress ?? res?.wifi?.ipAddress ?? null),
        onFailure: () => finish(null),
      });
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function webrtcLocalIp(): Promise<string | null> {
  const RTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  if (!RTC) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: string | null) => {
      if (!settled) {
        settled = true;
        try {
          pc.close();
        } catch {
          /* ignore */
        }
        resolve(v);
      }
    };
    let pc: RTCPeerConnection;
    try {
      pc = new RTC({ iceServers: [] });
      pc.createDataChannel('kroma');
      pc.onicecandidate = (e) => {
        const cand = e.candidate?.candidate;
        if (!cand) return;
        // Ignore mDNS-obfuscated candidates (`*.local`); take a private IPv4.
        const ip = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(cand)?.[1];
        if (ip && isPrivateIPv4(ip)) finish(ip);
      };
      void pc.createOffer().then((o) => pc.setLocalDescription(o));
    } catch {
      return finish(null);
    }
    setTimeout(() => finish(null), 1500);
  });
}

function isPrivateIPv4(ip: string): boolean {
  return ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

// ----- probing ----------------------------------------------------------------

/** Probe `urls` (≤ `concurrency` at a time); resolve the first that is a live
 *  KROMA server, or `null` when all fail. */
function raceForServer(
  urls: string[],
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  concurrency = urls.length,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (urls.length === 0) return resolve(null);
    let next = 0;
    let active = 0;
    let done = 0;
    let settled = false;
    const total = urls.length;

    const pump = () => {
      while (active < concurrency && next < total && !settled) {
        const url = urls[next++];
        if (url === undefined) break;
        active += 1;
        void probe(fetchFn, url, timeoutMs).then((ok) => {
          active -= 1;
          done += 1;
          if (ok && !settled) {
            settled = true;
            resolve(url);
          } else if (done === total && !settled) {
            resolve(null);
          } else {
            pump();
          }
        });
      }
    };
    pump();
  });
}

/** Probe every url (≤ `concurrency` at a time) and collect ALL live servers,
 *  in probe order. Unlike [`raceForServer`] this waits for the full sweep. */
async function probeAll(
  urls: string[],
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  concurrency: number,
): Promise<Array<{ url: string; body: HealthBody }>> {
  // Results are written into the slot they were claimed from, so probe order
  // holds by construction: no post-hoc sort, and no dependence on the urls
  // being unique.
  const slots: Array<{ url: string; body: HealthBody } | null> = urls.map(() => null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const url = urls[i];
      if (url === undefined) break;
      const body = await probeHealth(fetchFn, url, timeoutMs);
      if (body) slots[i] = { url, body };
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, worker),
  );
  return slots.filter((hit): hit is { url: string; body: HealthBody } => hit !== null);
}

interface HealthBody {
  status?: string;
  name?: string;
  version?: string;
  instanceId?: string;
  libraries?: number;
  items?: number;
  shows?: number;
}

async function probeHealth(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<HealthBody | null> {
  const ctrl = new AbortController();
  // Cleared in `finally`: on the throw path (abort, DNS failure, connection
  // refused) an un-cleared timer stays armed, and a /24 sweep arms 253 of them.
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as HealthBody;
    return body?.status === 'ok' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probe(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<boolean> {
  return (await probeHealth(fetchFn, base, timeoutMs)) !== null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/(^|[^/])\/+$/, '$1');
}

// ----- minimal platform typings -----------------------------------------------

interface TizenNetwork {
  ipAddress?: string;
}
interface TizenSystemInfo {
  systeminfo?: {
    getPropertyValue(
      prop: 'WIFI_NETWORK' | 'ETHERNET_NETWORK',
      onSuccess: (data: TizenNetwork) => void,
      onError?: () => void,
    ): void;
  };
}
interface WebOSBridge {
  service?: {
    request(
      uri: string,
      params: {
        method: string;
        parameters?: unknown;
        onSuccess?: (res: { wired?: TizenNetwork; wifi?: TizenNetwork }) => void;
        onFailure?: () => void;
      },
    ): void;
  };
}
