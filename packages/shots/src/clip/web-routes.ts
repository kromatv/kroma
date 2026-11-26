import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A page of the web client's file router: its path as segments, `:param`
 *  where it takes one, whether it ends in a splat, whether it sits under a
 *  layout, and whether it plays something. */
export interface WebRoute {
  segments: readonly string[];
  splat: boolean;
  nested: boolean;
  player: boolean;
}

const ROUTES_DIR = 'clients/web/src/routes';
const PLAYER = '_player';
const PARAM = ':param';

function isRouteFile(file: string): boolean {
  return file.endsWith('.tsx') && !file.startsWith('-') && !file.startsWith('__');
}

/** The route a TanStack Router file name declares: `_app.movies.$id.tsx` is
 *  `/movies/:param`, a `_` segment is a layout with no path, `index` is the
 *  layout's own page and `$` alone a splat. */
export function routeOf(file: string): WebRoute {
  const names = file.replace(/\.tsx$/, '').split('.');
  const path = names.filter((name) => !name.startsWith('_') && name !== 'index');
  const splat = path.at(-1) === '$';
  const segments = (splat ? path.slice(0, -1) : path).map((name) =>
    name.startsWith('$') ? PARAM : name,
  );
  return { segments, splat, nested: names.length > 1, player: names.includes(PLAYER) };
}

/** Every route of the web client, read from its routes folder. */
export function webRoutes(repoDir: string): WebRoute[] {
  return readdirSync(join(repoDir, ROUTES_DIR)).filter(isRouteFile).map(routeOf);
}

function pathOf(route: WebRoute): string {
  return `/${route.segments.join('/')}`;
}

/** Where a crawl starts: every page under a layout that takes no param and
 *  plays nothing, each once. */
export function crawlSeeds(routes: readonly WebRoute[]): string[] {
  const seeds = routes.filter(
    (route) => route.nested && !route.splat && !route.player && !route.segments.includes(PARAM),
  );
  return [...new Set(seeds.map(pathOf))].sort();
}

function matches(route: WebRoute, segments: readonly string[]): boolean {
  if (route.splat || route.segments.length !== segments.length) {
    return false;
  }
  return route.segments.every((name, i) => name === PARAM || name === segments[i]);
}

/** What makes two pages the same for a crawl: the route they share when it
 *  takes a param, so one title stands for every title, else the path itself.
 *  Null for a page that plays something. */
export function pageKey(path: string, routes: readonly WebRoute[]): string | null {
  const segments = path.split('/').filter(Boolean);
  const matching = routes.filter((candidate) => matches(candidate, segments));
  const route = matching.find((candidate) => !candidate.segments.includes(PARAM)) ?? matching[0];
  if (route?.player) {
    return null;
  }
  return route ? pathOf(route) : path;
}

/** The paths among `paths` no page already in `seen` stands for, in order,
 *  recording each in `seen`. */
export function unseenPages(
  paths: readonly string[],
  seen: Set<string>,
  routes: readonly WebRoute[],
): string[] {
  const fresh: string[] = [];
  for (const path of paths) {
    const key = pageKey(path, routes);
    if (key !== null && !seen.has(key)) {
      seen.add(key);
      fresh.push(path);
    }
  }
  return fresh;
}

/** The path a link leads to on `origin`, without its query, or null for a link
 *  off it or into the API. */
export function linkPath(href: string, origin: string): string | null {
  const url = new URL(href, origin);
  const inApp = url.origin === origin && !url.pathname.startsWith('/api/');
  return inApp ? url.pathname : null;
}
