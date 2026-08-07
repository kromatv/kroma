// The catalog as the site consumes it. Parsed with zod at the trust boundary:
// the JSON crosses the network (or arrives injected by the worker), and one
// malformed third-party field must not blank the whole page.

import { z } from 'zod';

export const ModuleEntry = z.object({
  id: z.string(),
  name: z.string().default(''),
  version: z.string().default(''),
  description: z.string().nullish(),
  minServer: z.string().nullish(),
  library: z.boolean().nullish(),
  // Schema 2 emits a `{ id: range }` map; very old catalogs carried an array.
  dependsOn: z.union([z.record(z.string(), z.string()), z.array(z.string())]).nullish(),
  provides: z.array(z.object({ kind: z.string(), id: z.string() })).nullish(),
  icon: z.string().nullish(),
  artifacts: z
    .array(z.object({ target: z.string().nullish(), size: z.number().nullish() }))
    .nullish(),
  size: z.number().nullish(),
});
export type ModuleEntry = z.infer<typeof ModuleEntry>;

export const Catalog = z.object({
  generatedAt: z.string().nullish(),
  modules: z.array(ModuleEntry).default([]),
  error: z.string().nullish(),
});
export type Catalog = z.infer<typeof Catalog>;

export function depList(deps: ModuleEntry['dependsOn']): string[] {
  if (Array.isArray(deps)) return deps;
  return deps ? Object.keys(deps) : [];
}

/** The worker injects the catalog into index.html at the edge; the vite dev
 * server leaves the placeholder, so dev falls back to fetching: the local
 * route first, then the live registry (CORS-open). */
export async function loadCatalog(): Promise<Catalog> {
  const raw = document.getElementById('kroma-catalog')?.textContent?.trim();
  if (raw && raw !== '"__CATALOG__"') return Catalog.parse(JSON.parse(raw));
  for (const url of ['/modules.json', 'https://modules.kroma.tv/modules.json']) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) continue;
    const body = await res.json().catch(() => null);
    const parsed = Catalog.safeParse(body);
    if (parsed.success) return parsed.data;
  }
  throw new Error('no catalog reachable');
}
