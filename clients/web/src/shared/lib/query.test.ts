// The SPA's single TanStack Query client.

import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { makeQueryClient } from './query';

const defaults = (client: QueryClient) => client.getDefaultOptions().queries;

describe('the defaults', () => {
  it('serves cache instantly on back-navigation', () => {
    expect(defaults(makeQueryClient())?.staleTime).toBe(30_000);
  });

  it('keeps an unused entry long enough to come back to', () => {
    expect(defaults(makeQueryClient())?.gcTime).toBe(5 * 60_000);
  });

  it('retries once, and only once', () => {
    expect(defaults(makeQueryClient())?.retry).toBe(1);
  });

  it('does not refetch every time the window regains focus', () => {
    expect(defaults(makeQueryClient())?.refetchOnWindowFocus).toBe(false);
  });

  it('gives each fresh client its own cache', () => {
    const a = makeQueryClient();
    const b = makeQueryClient();
    a.setQueryData(['item', 'x'], { title: 'A' });
    expect(b.getQueryData(['item', 'x'])).toBeUndefined();
  });
});
