// LAN auto-discovery for the KROMA server. Browsers and TV webviews cannot
// browse mDNS from JavaScript, hence the named candidates and the /24 sweep.

export interface DiscoverOptions {
  candidates?: string[];
  timeoutMs?: number;
  scanSubnet?: boolean;
  port?: number;
  concurrency?: number;
  localIp?: string;
  fetch?: typeof globalThis.fetch;
  browse?: (timeoutMs: number) => Promise<Array<{ host: string; port: number; name?: string }>>;
  browseMs?: number;
}

export const DEFAULT_DISCOVERY_CANDIDATES = ['http://kroma.local:4040'];

export async function discoverServer(opts: DiscoverOptions = {}): Promise<string | null> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const port = opts.port ?? 4040;

  // Browse and named candidates run concurrently: wifi that blocks multicast
  // makes the browse cost its full timeout, so the worst case is the slower of
  // the two rather than their sum. A browse hit still wins when it answers.
  const named = (opts.candidates ?? DEFAULT_DISCOVERY_CANDIDATES).map(stripTrailingSlash);
  const [announced, namedHit] = await Promise.all([
    browsedOrigins(opts, fetchFn),
    raceForServer(named, fetchFn, opts.timeoutMs ?? 2000),
  ]);
  if (announced.length > 0) return announced[0] ?? null;
  if (namedHit) return namedHit;

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

// A browse that throws is a browse that found nothing: it sits in front of two
// working fallbacks and must never be the reason discovery fails.
async function browsedOrigins(
  opts: DiscoverOptions,
  fetchFn: typeof globalThis.fetch,
): Promise<string[]> {
  if (!opts.browse) return [];
  let announced: Array<{ host: string; port: number }> = [];
  try {
    announced = await opts.browse(opts.browseMs ?? 1500);
  } catch {
    return [];
  }
  const resolved = await Promise.all(
    announced.map((service) =>
      resolveServerOrigin(`${service.host}:${service.port}`, {
        fetch: fetchFn,
        timeoutMs: opts.timeoutMs ?? 2000,
      }),
    ),
  );
  return resolved.filter((hit) => hit !== null).map((hit) => hit.url);
}

export interface ResolvedOrigin {
  url: string;
  secure: boolean;
}

/** Resolves which scheme a typed address actually speaks: an address without
 * one is probed https first; an explicit scheme is honoured as typed. Null
 * means nothing answered, which is not the same as insecure. */
export async function resolveServerOrigin(
  address: string,
  opts: { fetch?: typeof globalThis.fetch; timeoutMs?: number; port?: number } = {},
): Promise<ResolvedOrigin | null> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const typed = stripTrailingSlash(address.trim());
  if (!typed) return null;
  const timeoutMs = opts.timeoutMs ?? 2500;

  const candidates = originCandidates(typed, opts.port ?? 4040);
  // Probed concurrently but resolved by priority: the standard port must beat
  // the same host on 4040 even when 4040 answers first.
  const reached = await Promise.all(
    candidates.map((url) => probeFinalOrigin(fetchFn, url, timeoutMs)),
  );
  const winner = reached.find((origin) => origin !== null);
  return winner ? { url: winner, secure: winner.toLowerCase().startsWith('https://') } : null;
}

// The final URL decides, not the requested one: fetch follows an http-to-https
// redirect, which would otherwise file a TLS server under `http://`.
async function probeFinalOrigin(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as HealthBody;
    if (body?.status !== 'ok') return null;
    // `res.url` is empty on the odd fetch implementation that omits it.
    return originOf(res.url) ?? base;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return stripTrailingSlash(new URL(url).origin);
  } catch {
    return null;
  }
}

// Every origin a typed address could mean, best first. Only what is missing is
// guessed at: a typed scheme or port is never swapped.
function originCandidates(typed: string, defaultPort: number): string[] {
  const hasScheme = /^https?:\/\//i.test(typed);
  // Authority only: a port lives before the first slash, so a path like
  // `host/kroma` must not be mistaken for one.
  const authority = typed.replace(/^https?:\/\//i, '').split('/')[0] ?? '';
  const hasPort = /:\d+$/.test(authority);

  if (hasScheme) {
    // Without a port the standard one is meant first, but 4040 is where this
    // project's server actually lives.
    return hasPort ? [typed] : [typed, `${typed}:${defaultPort}`];
  }
  if (hasPort) return [`https://${typed}`, `http://${typed}`];
  return [
    `https://${typed}`,
    `http://${typed}`,
    `https://${typed}:${defaultPort}`,
    `http://${typed}:${defaultPort}`,
  ];
}

export interface DiscoveredServer {
  url: string;
  name?: string;
  version?: string;
  instanceId?: string;
}

// The fingerprint fallback (servers too old to send an `instanceId`) is a guess,
// so it is namespaced and cannot collide with a real id.
function identityOf(body: HealthBody): string {
  if (body.instanceId) return `id:${body.instanceId}`;
  return `fp:${[body.name, body.version, body.libraries, body.items, body.shows].join('|')}`;
}

/** Every live KROMA server on the network. Duplicate answers for one server
 *  (its mDNS name and its IP) collapse on identity, keeping the first origin. */
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
  // Announced servers come first: a published origin is the only one that can
  // carry a non-default port or a TLS front door.
  const announced = async () => {
    const origins = await browsedOrigins(opts, fetchFn);
    return probeAll(origins, fetchFn, opts.timeoutMs ?? 2000, Math.max(1, origins.length));
  };
  // Named candidates stay ahead of the sweep so a `.local` origin wins over the
  // bare IP for the same server.
  const [announcedHits, namedHits, subnetHits] = await Promise.all([
    announced(),
    probeAll(named, fetchFn, opts.timeoutMs ?? 2000, named.length),
    subnet(),
  ]);

  const seen = new Set<string>();
  const found: DiscoveredServer[] = [];
  for (const hit of [...announcedHits, ...namedHits, ...subnetHits]) {
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

/** Every `http://<prefix>.1..254:<port>` origin in the /24 containing `ip`,
 *  excluding the device's own address. */
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

async function probeAll(
  urls: string[],
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  concurrency: number,
): Promise<Array<{ url: string; body: HealthBody }>> {
  // Results go into the slot they were claimed from, so probe order holds
  // without a sort and without the urls having to be unique.
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
  // Cleared in `finally`, or a /24 sweep leaves 253 timers armed on the throw
  // path (abort, DNS failure, connection refused).
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
