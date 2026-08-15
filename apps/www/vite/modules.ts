import type { Plugin } from 'vite';
import { z } from 'zod';
import { type SiteCatalog, toSiteCatalog } from '../src/lib/modules.ts';

// The official module catalog, fetched once per build and compiled into the
// bundle as `virtual:kroma-modules`. The browser never requests it: the list is
// part of the prerendered HTML, so it renders without JS and costs no round
// trip. The price of that choice is staleness: the site shows the catalog as of
// its last deploy.

const CATALOG_URL = 'https://modules.kroma.tv/modules.json';
const VIRTUAL_ID = 'virtual:kroma-modules';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

// The catalog is ~40 kB, most of it inline SVG icons. A response an order of
// magnitude larger is not the file we asked for, and the body is held in memory
// before it is parsed, so the ceiling is checked there rather than after.
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

// Only a data URI survives: the site is self-contained, so an icon that would
// reach a third-party host at render time is dropped rather than embedded.
const Icon = z
  .string()
  .nullish()
  .transform((v) => (v?.startsWith('data:image/') ? v : null));

const Entry = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  version: z.string().default(''),
  description: z.string().nullish(),
  library: z.boolean().nullish(),
  icon: Icon,
  dependsOn: z.union([z.record(z.string(), z.string()), z.array(z.string())]).nullish(),
  provides: z.array(z.object({ kind: z.string() }).loose()).nullish(),
  requires: z.array(z.object({ kind: z.string() }).loose()).nullish(),
});

const Catalog = z.object({
  generatedAt: z.string().nullish(),
  modules: z.array(Entry).default([]),
});

async function fetchCatalog(): Promise<SiteCatalog> {
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${CATALOG_URL} answered ${res.status} ${res.statusText}`);

  const body = await res.text();
  if (body.length > MAX_BYTES) {
    throw new Error(`${CATALOG_URL} returned ${body.length} bytes, over the ${MAX_BYTES} ceiling`);
  }

  const parsed = Catalog.safeParse(JSON.parse(body));
  if (!parsed.success) throw new Error(`${CATALOG_URL} is not a catalog: ${parsed.error.message}`);
  if (parsed.data.modules.length === 0) throw new Error(`${CATALOG_URL} listed no modules`);

  return toSiteCatalog(parsed.data);
}

const EMPTY: SiteCatalog = { generatedAt: null, modules: [] };

/**
 * Serves `virtual:kroma-modules`. A build that cannot reach the catalog fails,
 * so a deploy never silently ships a modules page with no modules on it; dev
 * degrades to an empty list instead, so the site still runs offline.
 */
export function modulesPlugin(): Plugin {
  let catalog: Promise<SiteCatalog> | undefined;
  let isBuild = false;

  return {
    name: 'kroma-modules',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      catalog ??= fetchCatalog().catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        if (isBuild) throw new Error(`Module catalog unavailable: ${reason}`);
        this.warn(`Module catalog unavailable, serving an empty list: ${reason}`);
        return EMPTY;
      });
      return `export const catalog = ${JSON.stringify(await catalog)};`;
    },
  };
}
