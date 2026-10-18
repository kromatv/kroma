import { createQueryClient } from '@kromatv/client/query';
import { QueryClient } from '@tanstack/react-query';
import { createAdminApi } from '#web/features/admin/module-api';
import type { WebRuntime } from './api';
import { createQueries } from './queries';

/** Complete the narrow domain stubs with real, independently owned client controls. */
export function createWebTestClient<T extends object>(supplied: T) {
  const baseUrl =
    'baseUrl' in supplied && typeof supplied.baseUrl === 'string'
      ? supplied.baseUrl
      : 'http://kroma.test';
  const client = createQueryClient({ baseUrl, fetch: (...args) => globalThis.fetch(...args) });
  return Object.defineProperties({} as typeof client & T, {
    ...Object.getOwnPropertyDescriptors(client),
    ...Object.getOwnPropertyDescriptors(supplied),
  });
}
/** A unit-test root owns its API stubs and query factories together. */
export function createWebTestRuntime(client: object, queryCache?: () => QueryClient): WebRuntime {
  const owned = createWebTestClient(client);
  const cache = queryCache ? null : new QueryClient();
  return {
    client: owned,
    get queryClient() {
      const value = queryCache?.() ?? cache;
      if (!value) throw new Error('test query root missing');
      return value;
    },
    queries: createQueries(owned),
    moduleApi: createAdminApi(owned),
    ensureSession: async () => {},
  };
}
