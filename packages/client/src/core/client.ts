import type { RequestContext } from './http';

// What a domain's `client.ts` takes from the transport, re-exported so this is
// the one module it imports: `declare module` resolves only against a module
// already in the program, and a consumer that imports nothing but
// `@kromatv/client/media` reaches this file only through that import.
export type { Query, RequestContext } from './http';

/**
 * Every namespace `KromaClient` carries.
 *
 * Nothing enumerates them. A domain declares itself into this interface from
 * its own `src/api/<name>/client.ts`, and the runtime finds the same folder by
 * globbing, so adding a domain is adding a folder.
 */
// oxlint-disable-next-line typescript/no-empty-interface -- every domain augments it from its own file.
export interface Domains {}

/** A domain's endpoints over the shared transport. Each `client.ts` default-exports
 * one; a domain whose `urls.ts` answers synchronously default-exports another there. */
export type DomainFactory = (ctx: RequestContext) => object;

/** Imports one domain's `client.ts` and hands back its factory. */
export type DomainLoader = () => Promise<DomainFactory>;

/** The folder name out of a globbed path: `./media/client.ts` is `media`. */
export function domainKey(path: string): string {
  return path.split('/').at(-2) ?? '';
}

/** Every domain bound to one context, and the way to load one ahead of its first call. */
export interface BoundDomains {
  readonly domains: Domains;
  preload(domain: keyof Domains): Promise<void>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function mergeHalves(eager: object, loaded: object): object {
  const merged: Record<string, unknown> = { ...eager };
  for (const [name, member] of Object.entries(loaded)) {
    const held = merged[name];
    merged[name] =
      isPlainObject(held) && isPlainObject(member) ? mergeHalves(held, member) : member;
  }
  return merged;
}

/** Hand one context to every discovered domain, both halves of each, up front. */
export function bindDomains(
  ctx: RequestContext,
  factories: Readonly<Record<string, DomainFactory>>,
  urls: Readonly<Record<string, DomainFactory>> = {},
): BoundDomains {
  const bound = Object.entries(factories).map(
    ([name, factory]) => [name, mergeHalves(urls[name]?.(ctx) ?? {}, factory(ctx))] as const,
  );
  return {
    domains: Object.fromEntries(bound) as unknown as Domains,
    preload: () => Promise.resolve(),
  };
}
