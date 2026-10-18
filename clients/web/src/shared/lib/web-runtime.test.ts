import { createQueryClient } from '@kromatv/client/query';
import { describe, expect, it } from 'vitest';
import { createWebRuntime } from './api';

describe('router-owned API state', () => {
  it('keeps credentials, query factories and cached data independent between routers', () => {
    const a = createWebRuntime({
      client: createQueryClient({ baseUrl: 'http://a.test', authToken: 'a' }),
    });
    const b = createWebRuntime({
      client: createQueryClient({ baseUrl: 'http://b.test', authToken: 'b' }),
    });
    a.queryClient.setQueryData(['private'], 'alice');
    expect(b.queryClient.getQueryData(['private'])).toBeUndefined();
    expect(a.queries.userQueries.sessions().queryKey).not.toEqual(
      b.queries.userQueries.sessions().queryKey,
    );
    a.client.setAuthToken(undefined);
    expect(b.client.sessionToken).toBe('b');
    a.queryClient.clear();
    b.queryClient.clear();
  });
});
