import { workerContext } from '@kroma/site-kit/worker-env';
import { createServerFn } from '@tanstack/react-start';
import type { ModuleEntry } from '#site/catalog';
import { withIconUrls } from '#site/lib/icon';
import { loadCatalog } from '#site/lib/source';

/** What the browse pages render: the catalog read live from the upstream release,
 *  with `registry` the URL a KROMA server would add to reach this site. */
export async function catalogPayload(origin: string): Promise<{
  registry: string;
  modules: ModuleEntry[];
  generatedAt: string | null;
}> {
  // Imported here, not at module scope: zod would otherwise reach the client
  // bundle, which this module is also part of.
  const { parseCatalog } = await import('#site/catalog');
  const { env, waitUntil } = await workerContext();
  const registry = `${origin}/modules.json`;
  const body = await loadCatalog(env, waitUntil);
  const catalog = body ? parseCatalog(body) : null;
  if (!catalog) return { registry, modules: [], generatedAt: null };
  return {
    registry,
    modules: withIconUrls(catalog.modules),
    generatedAt: catalog.generatedAt ?? null,
  };
}

/** The same payload for the site the request arrived at: the registry url a
 *  KROMA server would add is the origin the page was served from. */
export async function catalogForRequest() {
  const { getRequest } = await import('@tanstack/react-start/server');
  return catalogPayload(new URL(getRequest().url).origin);
}

export const getCatalog = createServerFn().handler(catalogForRequest);
