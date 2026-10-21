import type { BoundDomains, DomainFactory, DomainLoader, Domains, RequestContext } from './client';
import { pathTree } from './path-tree';

type Load = () => Promise<object>;

interface Domain {
  readonly name: string;
  readonly load: Load;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function once(loader: DomainLoader, ctx: RequestContext): Load {
  let pending: Promise<object> | undefined;
  return () =>
    (pending ??= loader().then(
      (factory) => factory(ctx),
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    ));
}

async function invoke(domain: Domain, path: readonly string[], args: unknown[]): Promise<unknown> {
  let parent: unknown;
  let node: unknown = await domain.load();
  for (const step of path) {
    parent = node;
    node = isPlainObject(node) ? node[step] : undefined;
  }
  if (typeof node !== 'function') {
    throw new TypeError(`${[domain.name, ...path].join('.')} is not a function`);
  }
  return Reflect.apply(node, parent, args);
}

function namespace(domain: Domain, path: readonly string[], eager: object): object {
  const members: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(eager)) {
    members[name] = isPlainObject(member) ? namespace(domain, [...path, name], member) : member;
  }
  const materialize = (target: Record<string, unknown>, key: string) => {
    if (key === 'then' || Reflect.has(target, key)) return;
    target[key] = pathTree(
      [...path, key],
      (at) =>
        (...args) =>
          invoke(domain, at, args),
    );
  };
  return new Proxy(members, {
    get(target, key, receiver) {
      if (typeof key === 'string') materialize(target, key);
      return Reflect.get(target, key, receiver);
    },
    getOwnPropertyDescriptor(target, key) {
      if (typeof key === 'string') materialize(target, key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

/**
 * Bind every domain without importing one. Each namespace answers its
 * synchronous members from the domain's `urls.ts` at once; any other member
 * imports the domain's `client.ts` on its first call, binds it to `ctx` once,
 * and forwards. A failed import is retried by the next call.
 */
export function bindLazyDomains(
  ctx: RequestContext,
  loaders: Readonly<Record<string, DomainLoader>>,
  urls: Readonly<Record<string, DomainFactory>> = {},
): BoundDomains {
  const loads = new Map<string, Load>();
  const bound = Object.entries(loaders).map(([name, loader]) => {
    const load = once(loader, ctx);
    loads.set(name, load);
    const eager = urls[name]?.(ctx) ?? {};
    return [name, namespace({ name, load }, [], eager)] as const;
  });
  return {
    domains: Object.fromEntries(bound) as unknown as Domains,
    preload: async (domain) => {
      await loads.get(domain)?.();
    },
  };
}
