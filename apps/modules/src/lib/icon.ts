import { type Env, loadCatalog } from '#site/lib/source';

const DATA_SVG = 'data:image/svg+xml;base64,';

/** Where a module's icon is served from, versioned so it can be cached forever. */
export function iconPath(id: string, version: string): string {
  return `/icon/${encodeURIComponent(id)}/${encodeURIComponent(version || '0')}.svg`;
}

/** The icon as a URL rather than the data URI the catalog carries. */
export function withIconUrls<T extends { id: string; version: string; icon?: string | null }>(
  modules: readonly T[],
): T[] {
  return modules.map((m) =>
    m.icon?.startsWith(DATA_SVG) ? { ...m, icon: iconPath(m.id, m.version) } : { ...m },
  );
}

const ICON_ROUTE = /^\/icon\/([^/]+)\/[^/]+\.svg$/;

/** Serves what `iconPath` points at, or null when the path is not one. */
export async function iconResponse(
  path: string,
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response | null> {
  const match = ICON_ROUTE.exec(path);
  if (!match?.[1]) return null;
  const id = decodeURIComponent(match[1]);

  const body = await loadCatalog(env, waitUntil);
  if (!body) return new Response('catalog unavailable', { status: 503 });

  const { parseCatalog } = await import('#site/catalog');
  const icon = parseCatalog(body)?.modules.find((m) => m.id === id)?.icon;
  if (!icon?.startsWith(DATA_SVG)) return new Response('no such icon', { status: 404 });

  return new Response(atob(icon.slice(DATA_SVG.length)), {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
