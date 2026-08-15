// Live catalog assembly for the dynamic Synology package source: the GitHub Releases list plus
// the `<spk>.info.json` sidecars CI attaches to every .spk, turned into channel-aware catalog
// entries. Publishing a release IS the deploy.

export type Env = {
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
};

export type SpkInfo = {
  package: string;
  version: string;
  dname: string;
  desc: string;
  arch: string;
  firmware: string;
  size: number;
  md5: string;
  beta: boolean;
};

export type Entry = {
  channel: 'stable' | 'nightly';
  tag: string;
  releaseName: string;
  releaseUrl: string;
  publishedAt: string;
  spkName: string;
  spkUrl: string;
  spkSize: number;
  notes: string;
  info: SpkInfo | null;
};

export type Catalog = {
  fetchedAt: string;
  repo: string;
  entries: Entry[];
};

type GhAsset = {
  name: string;
  size: number;
  browser_download_url: string;
  updated_at?: string | null;
};
type GhRelease = {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  body?: string | null;
  assets: GhAsset[];
};

export const DEFAULT_REPO = 'maxscharwath/kroma';
const CACHE_FRESH = 'https://kroma-packages.cache/catalog-fresh';
const CACHE_STALE = 'https://kroma-packages.cache/catalog-stale';
const MAX_SIDECARS = 60;

const edgeCache = (): Cache | undefined =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;

// Off workerd there is no `caches.default`, and anonymous GitHub allows sixty
// requests an hour. Keyed on the env so a changed binding never answers stale.
const memory = new WeakMap<Env, { at: number; catalog: Catalog }>();

const MEMORY_TTL = 300_000;

function ghHeaders(env: Env): HeadersInit {
  const h: Record<string, string> = {
    'user-agent': 'kroma-package-source-worker',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) h.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

async function fetchCatalogFromGitHub(env: Env): Promise<Catalog> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: ghHeaders(env),
  });
  if (!res.ok) throw new Error(`GitHub releases API ${res.status}`);
  const releases = (await res.json()) as GhRelease[];

  const entries: Entry[] = [];
  for (const r of releases) {
    if (r.draft) continue;
    const spk = newestSpk(r.assets);
    if (!spk) continue; // desktop-latest & friends carry no package
    const nonNightly = r.prerelease ? null : 'stable';
    const channel = r.tag_name === 'nightly' ? 'nightly' : nonNightly;
    if (!channel) continue;
    // The rolling `nightly` tag keeps the date it was first cut; its asset does not.
    const rolling = channel === 'nightly' ? spk.updated_at : null;
    entries.push({
      channel,
      tag: r.tag_name,
      releaseName: r.name || r.tag_name,
      releaseUrl: r.html_url,
      publishedAt: rolling || r.published_at || '',
      spkName: spk.name,
      spkUrl: spk.browser_download_url,
      spkSize: spk.size,
      notes: (r.body ?? '').trim(),
      info: null,
    });
  }

  await Promise.all(
    entries.slice(0, MAX_SIDECARS).map(async (e) => {
      const rel = releases.find((r) => r.tag_name === e.tag);
      const sidecar = rel?.assets.find((a) => a.name === `${e.spkName}.info.json`);
      if (!sidecar) return;
      try {
        const res = await fetch(sidecar.browser_download_url, {
          headers: { 'user-agent': 'kroma-package-source-worker' },
        });
        if (res.ok) e.info = (await res.json()) as SpkInfo;
      } catch {
        // tolerate a missing/broken sidecar; the entry just loses md5/desc
      }
    }),
  );

  entries.sort(cmpEntries);
  return { fetchedAt: new Date().toISOString(), repo, entries };
}

/** 5-minute edge cache, refreshed inline on miss; a week-long stale copy answers
 * if GitHub is down or rate-limits the anonymous fetch. */
export async function loadCatalog(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Catalog> {
  const cache = edgeCache();
  const hit = await cache?.match(CACHE_FRESH);
  if (hit) return (await hit.json()) as Catalog;
  const held = memory.get(env);
  if (!cache && held && Date.now() - held.at < MEMORY_TTL) return held.catalog;
  try {
    const catalog = await fetchCatalogFromGitHub(env);
    const body = JSON.stringify(catalog);
    memory.set(env, { at: Date.now(), catalog });
    if (cache) {
      waitUntil(cache.put(CACHE_FRESH, jsonResponse(body, 300)));
      waitUntil(cache.put(CACHE_STALE, jsonResponse(body, 604800)));
    }
    return catalog;
  } catch (err) {
    const stale = await cache?.match(CACHE_STALE);
    if (stale) return (await stale.json()) as Catalog;
    if (held) return held.catalog;
    throw err;
  }
}

function jsonResponse(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${maxAge}` },
  });
}

const newestSpk = (assets: GhAsset[]): GhAsset | undefined =>
  assets
    .filter((a) => a.name.endsWith('.spk'))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];

/** `kroma-0.1.25-3439372-x86_64.spk` -> `0.1.25-3439372`. Prefix-agnostic so
 * pre-rebrand `luma-*.spk` releases still parse their version. */
export function versionFromSpkName(name: string): string {
  const m = /^[a-z]+-(.+)-[a-z0-9_]+\.spk$/.exec(name);
  return m?.[1] ?? name.replace(/\.spk$/, '');
}

export function entryVersion(e: Entry): string {
  return e.info?.version ?? versionFromSpkName(e.spkName);
}

// The build is the FIRST dashed segment, not everything after the first dash: a
// nightly carries two (`1.2.3-nightly-20260811`) and DSM shows the first.
const splitBuild = (raw: string): [string, string | undefined] => {
  const cut = raw.indexOf('-');
  if (cut < 0) return [raw, undefined];
  const rest = raw.slice(cut + 1);
  const next = rest.indexOf('-');
  return [raw.slice(0, cut), next < 0 ? rest : rest.slice(0, next)];
};

/** The version string DSM's Package Center advertises. build.sh stamps
 *  `X.Y.Z.BUILD`, the build in a 4th feature segment, and this hands that back
 *  UNCHANGED: rewriting it is what broke the Update button, because DSM compares
 *  the dotted feature version and an installed `0.1.38.3480473` outranks every
 *  `0.1.38-*` a rewrite could offer. One shape, INFO to catalog.
 *
 *  The only thing normalised is the older doubly-stamped `X.Y.Z.BUILD-BUILD`,
 *  whose suffix repeats the 4th segment and carries no extra ordering. */
export function dsmVersion(raw: string): string {
  const [feat, suffix] = splitBuild(raw);
  // A build already inside the feature version needs no suffix beside it.
  if (feat.split('.').length > 3) return feat;
  return suffix ? `${feat}-${suffix}` : feat;
}

/** DSM's version ordering: the dotted feature version numerically, segment by
 * segment, then the -build suffix. */
export function cmpDsmVersion(a: string, b: string): number {
  const parse = (v: string) => {
    const [feat, build] = splitBuild(v);
    return {
      seg: feat.split('.').map((n) => Number.parseInt(n, 10) || 0),
      build: Number.parseInt(build ?? '', 10) || 0,
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.seg.length, pb.seg.length); i++) {
    const d = (pa.seg[i] ?? 0) - (pb.seg[i] ?? 0);
    if (d !== 0) return d;
  }
  return pa.build - pb.build;
}

export function cmpEntries(a: Entry, b: Entry): number {
  const byVersion = cmpDsmVersion(dsmVersion(entryVersion(b)), dsmVersion(entryVersion(a)));
  return byVersion || b.publishedAt.localeCompare(a.publishedAt);
}

const X86_64_ARCHES = new Set([
  'x86_64',
  'x64',
  'apollolake',
  'avoton',
  'braswell',
  'broadwell',
  'broadwellnk',
  'broadwellnkv2',
  'broadwellntbap',
  'bromolow',
  'cedarview',
  'denverton',
  'geminilake',
  'grantley',
  'icelaked',
  'kvmx64',
  'purley',
  'v1000',
  'r1000',
  'epyc7002',
]);

export function archSupported(arch: string | null): boolean {
  if (!arch) return true; // no arch reported: stay permissive
  return X86_64_ARCHES.has(arch.toLowerCase()) || arch.toLowerCase() === 'noarch';
}

/** One catalog entry -> the JSON object DSM's Package Center expects (same shape
 * as SynoCommunity's spkrepo). Must not emit `model`/`type`/`price`: DSM reads
 * `model: []` as an EMPTY supported-model whitelist and hides the row on every
 * NAS. */
export function toDsmPackage(e: Entry, origin: string, repo: string) {
  const info = e.info;
  return {
    package: info?.package ?? 'kroma',
    version: dsmVersion(entryVersion(e)),
    dname: info?.dname ?? 'KROMA',
    desc: info?.desc ?? 'KROMA - self-hosted, direct-play HEVC media streaming.',
    download_count: 0,
    recent_download_count: 0,
    link: e.spkUrl,
    size: info?.size ?? e.spkSize,
    md5: info?.md5,
    thumbnail: [`${origin}/icon.png`],
    thumbnail_retina: [`${origin}/icon.png`],
    snapshot: [],
    maintainer: 'KROMA',
    maintainer_url: `https://github.com/${repo}`,
    distributor: 'KROMA',
    distributor_url: `https://github.com/${repo}`,
    changelog: e.releaseUrl,
    firmware: info?.firmware ?? '7.0-40000',
    // No `beta` field: DSM's package-center list silently HIDES a `beta:true`
    // package served from a dynamic source. The channel is gated server-side by
    // WHICH entry we serve (see dsmPackages), not by a per-package flag.
    qinst: true,
    qstart: true,
    qupgrade: true,
    deppkgs: null,
    conflictpkgs: null,
    startable: 'yes',
  };
}
