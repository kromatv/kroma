import { site } from '@kroma/site-meta';
import type { Plugin } from 'vite';
import { type ChannelBuild, toCanaryBuilds } from '../src/lib/channels.ts';
import { Feed } from '../src/lib/release-feed.ts';
import { TARGET_IDS } from '../src/lib/release-targets.ts';
import { type SiteRelease, toSiteReleases } from '../src/lib/releases.ts';

// The site offers the releases as of its last deploy, so `bun run deploy:site`
// has to follow a promotion for the buttons to move on.

const REPO = site.repo.replace('https://github.com/', '');
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;
const VIRTUAL_ID = 'virtual:kroma-releases';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

// A page of a hundred releases runs to ~4 MB, most of it the module `.kmod`
// assets every product tag also carries. Two pages hold the whole history and
// the third is empty; the ceiling is per page, checked on the text before it is
// parsed because the body is held in memory either way.
const PAGES = 3;
const MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

function headers(): HeadersInit {
  const head: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'kroma-site-build',
    'x-github-api-version': '2022-11-28',
  };
  // Anonymous GitHub allows sixty requests an hour per IP, which CI runners
  // share. Without a token a build can fail on someone else's traffic.
  const token = process.env.GITHUB_TOKEN;
  if (token) head.authorization = `Bearer ${token}`;
  return head;
}

async function page(number: number): Promise<unknown[]> {
  const url = `${RELEASES_URL}?per_page=100&page=${number}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`);

  const body = await res.text();
  if (body.length > MAX_BYTES) {
    throw new Error(`${url} returned ${body.length} bytes, over the ${MAX_BYTES} ceiling`);
  }

  const entries: unknown = JSON.parse(body);
  if (!Array.isArray(entries)) throw new Error(`${url} did not answer with a list of releases`);
  return entries;
}

interface Published {
  releases: SiteRelease[];
  canary: ChannelBuild[];
}

const EMPTY: Published = { releases: [], canary: [] };

async function fetchReleases(): Promise<Published> {
  const entries: unknown[] = [];
  for (let number = 1; number <= PAGES; number++) {
    const batch = await page(number);
    entries.push(...batch);
    if (batch.length < 100) break;
  }

  const feed = Feed.parse(entries);
  const releases = toSiteReleases(feed);
  if (releases.length === 0) throw new Error(`${RELEASES_URL} published no vX.Y.Z release`);

  // Only the newest has to be whole. An old release predates a platform, and
  // failing the build over that would pin the archive to whatever shipped first.
  const [newest] = releases;
  const missing = TARGET_IDS.filter((id) => !newest?.downloads.some((d) => d.target === id));
  if (newest && missing.length > 0) {
    throw new Error(`${newest.tag} carries no file for ${missing.join(', ')}`);
  }
  return { releases, canary: toCanaryBuilds(feed) };
}

/**
 * Serves `virtual:kroma-releases`. A build that cannot reach GitHub, or whose
 * newest release is missing a platform's file, fails: a deploy never ships a
 * download page that has quietly lost a platform. Dev degrades to an
 * empty history instead, so the site still runs offline.
 */
export function releasesPlugin(): Plugin {
  let published: Promise<Published> | undefined;
  let isBuild = false;

  return {
    name: 'kroma-releases',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      published ??= fetchReleases().catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        if (isBuild) throw new Error(`Releases unavailable: ${reason}`);
        this.warn(`Releases unavailable, offering no downloads: ${reason}`);
        return EMPTY;
      });
      const { releases, canary } = await published;
      return [
        `export const releases = ${JSON.stringify(releases)};`,
        `export const release = releases[0] ?? null;`,
        `export const canary = ${JSON.stringify(canary)};`,
      ].join('\n');
    },
  };
}
