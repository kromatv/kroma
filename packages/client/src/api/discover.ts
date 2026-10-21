import { type BoundDomains, bindDomains, type DomainFactory, domainKey } from '../core/client';
import type { RequestContext } from '../core/http';

// The Metro half; `discover.web.ts` beside it is Vite's. `require.context` is
// Metro's glob, expanded at build time from the literal call below.
interface MetroContext<T> {
  keys(): string[];
  (key: string): T;
}

declare const require: {
  context<T>(directory: string, recursive: boolean, filter: RegExp): MetroContext<T>;
};

function byDomain<T, R>(context: MetroContext<T>, pick: (mod: T) => R): Record<string, R> {
  const found: Record<string, R> = {};
  for (const key of context.keys()) found[domainKey(key)] = pick(context(key));
  return found;
}

const defaultOf = (mod: { default: DomainFactory }) => mod.default;

const factories = byDomain(require.context('.', true, /\/client\.ts$/), defaultOf);
const urls = byDomain(require.context('.', true, /\/urls\.ts$/), defaultOf);
const indexes = byDomain(require.context('.', true, /\/index\.ts$/), (mod) => mod);

/** Every domain's name, as its folder is named. */
export const domainNames: readonly string[] = Object.keys(factories);

/** One domain's `client.ts` factory, or undefined for a name no folder has. */
export function loadDomain(name: string): Promise<DomainFactory | undefined> {
  return Promise.resolve(factories[name]);
}

/** Bind every domain to `ctx`. Metro ships one bundle, so every domain is bound up front. */
export function bindEveryDomain(ctx: RequestContext): BoundDomains {
  return bindDomains(ctx, factories, urls);
}

/** Every domain's public module (`@kromatv/client/<domain>`) by domain name, for
 *  a host that hands them to code it loads at runtime. */
export const domainModules: Readonly<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  Object.entries(indexes).map(([name, mod]) => [name, () => Promise.resolve(mod)]),
);
