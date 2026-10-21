import { queryOptions } from '@tanstack/react-query';
import { loadDomain } from '../api/discover';
import type { Domains } from '../core/client';
import { createRequestContext, type KromaClientOptions } from '../core/http';
import { pathTree } from '../core/path-tree';
import { assembleClient, type KromaClient, kromaClientParts } from '../kroma-client';

type Read = (...args: never[]) => Promise<unknown>;

/** The reads of one namespace, and its sub-namespaces, as query factories. A
 * URL builder answers a string rather than a promise and is left out here; the
 * tree below names a path without knowing what is at its end, so the runtime tree
 * is a superset of this type and the extra members are unreachable. */
export type Queries<T> = {
  [K in keyof T as T[K] extends Read ? K : T[K] extends object ? K : never]: T[K] extends (
    ...args: infer A
  ) => Promise<infer R>
    ? (...args: A) => QueryFor<R>
    : Queries<T[K]>;
};

// `queryOptions` types `queryFn` as optional so `skipToken` can stand in for it,
// which is what `useSuspenseQuery` refuses. Every option here has one, so say so
// and both hooks take it; the key keeps the tag that types `getQueryData`.
type QueryFor<R> = ReturnType<typeof queryOptions<R, Error, R, readonly unknown[]>> & {
  queryFn: (context: { signal: AbortSignal }) => Promise<R>;
};

/** A client that also carries its reads as query options. */
export type QueryClient = KromaClient & { query: Queries<Domains> };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const keyOf = (baseUrl: string, path: readonly string[], args: readonly unknown[]) =>
  ['kroma', baseUrl, ...path, ...args] as const;

/**
 * A client that also carries every read as TanStack Query options.
 *
 * ```ts
 * const client = createQueryClient({ baseUrl });
 * const { data } = useSuspenseQuery(client.query.media.item(id)); // MediaItem
 * ```
 *
 * The queries fetch through the same transport as the client, so they share its
 * bearer, locale and 401 refresh. Each query gets a context of its own carrying
 * the runner's `AbortSignal`, so a cancelled query cancels its request.
 */
export function createQueryClient(options: KromaClientOptions): QueryClient {
  const { config, controls } = kromaClientParts(options);
  const client = assembleClient(config, controls);
  const run = async (path: readonly string[], args: readonly unknown[], signal: AbortSignal) => {
    const [domain = '', ...rest] = path;
    const factory = await loadDomain(domain);
    if (!factory) throw new Error(`no domain named ${domain}`);
    let node: unknown = factory(createRequestContext({ ...config, signal }));
    for (const step of rest) {
      if (!isPlainObject(node)) throw new Error(`${path.join('.')} is not callable`);
      node = node[step];
    }
    if (typeof node !== 'function') throw new Error(`${path.join('.')} is not callable`);
    return (node as (...a: unknown[]) => Promise<unknown>)(...args);
  };

  const query = pathTree(
    [],
    (path) =>
      (...args) =>
        queryOptions({
          queryKey: keyOf(config.baseUrl, path, args),
          queryFn: ({ signal }: { signal: AbortSignal }) => run(path, args, signal),
        }),
  ) as Queries<Domains>;

  return Object.defineProperty(client, 'query', { value: query, enumerable: true }) as QueryClient;
}
