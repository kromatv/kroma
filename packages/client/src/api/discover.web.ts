import {
  type BoundDomains,
  type DomainFactory,
  type DomainLoader,
  domainKey,
} from '../core/client';
import type { RequestContext } from '../core/http';
import { bindLazyDomains } from '../core/lazy-domains';

// The Vite half; `discover.ts` beside it is Metro's. Written out in full and
// cast in place: Vite finds `import.meta.glob(...)` by matching the literal
// text, and this package keeps `vite/client` types out.
interface GlobHost {
  glob(pattern: string, options: { import: 'default' }): Record<string, DomainLoader>;
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, DomainFactory>;
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const byDomain = <T>(globbed: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(globbed).map(([path, value]) => [domainKey(path), value]));

const loaders = byDomain(
  (import.meta as unknown as GlobHost).glob('./*/client.ts', { import: 'default' }),
);
const urls = byDomain(
  (import.meta as unknown as GlobHost).glob('./*/urls.ts', { eager: true, import: 'default' }),
);

/** Every domain's name, as its folder is named. */
export const domainNames: readonly string[] = Object.keys(loaders);

/** Import one domain's `client.ts` and answer its factory, or undefined for a name no folder has. */
export function loadDomain(name: string): Promise<DomainFactory | undefined> {
  return loaders[name]?.() ?? Promise.resolve(undefined);
}

/** Bind every domain to `ctx`, each importing its `client.ts` on its first call. */
export function bindEveryDomain(ctx: RequestContext): BoundDomains {
  return bindLazyDomains(ctx, loaders, urls);
}

/** Every domain's public module (`@kromatv/client/<domain>`) by domain name, each
 *  imported when asked for, for a host that hands them to code it loads at runtime. */
export const domainModules: Readonly<Record<string, () => Promise<unknown>>> = byDomain(
  (import.meta as unknown as GlobHost).glob('./*/index.ts'),
);
