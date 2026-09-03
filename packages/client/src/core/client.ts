import type { RequestContext } from './http';

/**
 * Every namespace `KromaClient` carries.
 *
 * Nothing enumerates them. A domain declares itself into this interface from
 * its own `src/api/<name>/client.ts`, and the runtime finds the same folder by
 * globbing, so adding a domain is adding a folder.
 */
// biome-ignore lint/suspicious/noEmptyInterface: every domain augments it from its own file.
export interface Domains {}

/** A domain's endpoints over the shared transport. Each `client.ts` default-exports one. */
export type DomainFactory = (ctx: RequestContext) => object;

/** The folder name out of a globbed path: `./media/client.ts` is `media`. */
export function domainKey(path: string): string {
  return path.split('/').at(-2) ?? '';
}

/** Hand one context to every discovered domain. */
export function bindDomains(
  ctx: RequestContext,
  factories: Readonly<Record<string, DomainFactory>>,
): Domains {
  const bound = Object.entries(factories).map(([name, factory]) => [name, factory(ctx)] as const);
  return Object.fromEntries(bound) as unknown as Domains;
}
