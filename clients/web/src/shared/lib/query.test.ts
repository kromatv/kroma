// The SPA's single TanStack Query client.
//
// There is ONE instance because route loaders prefetch with
// `queryClient.ensureQueryData` and components read the same key with
// `useSuspenseQuery`: same cache entry, one fetch. A second client anywhere
// would split the cache and re-introduce the waterfall the loader exists to
// remove.

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { makeQueryClient, queryClient } from './query';

const defaults = (client: QueryClient) => client.getDefaultOptions().queries;

describe('the shared instance', () => {
  it('is a real query client', () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });

  it('is the SAME one on every import', async () => {
    const again = await import('./query');
    // A loader's prefetch and a component's read have to land in one cache.
    expect(again.queryClient).toBe(queryClient);
  });

  it('is not what the factory returns', () => {
    // The factory exists for tests and for anything that wants isolation; using
    // it in the app would quietly split the cache.
    expect(makeQueryClient()).not.toBe(queryClient);
  });

  it('carries the app’s defaults, not the library’s', () => {
    expect(defaults(queryClient)).toEqual(defaults(makeQueryClient()));
  });
});

describe('the defaults', () => {
  it('serves cache instantly on back-navigation', () => {
    // Catalogue data is stable within a visit; 0 would refetch the grid every
    // time the user backs out of a title.
    expect(defaults(makeQueryClient())?.staleTime).toBe(30_000);
  });

  it('keeps an unused entry long enough to come back to', () => {
    expect(defaults(makeQueryClient())?.gcTime).toBe(5 * 60_000);
  });

  it('retries once, and only once', () => {
    // The client refreshes its own token on 401, so a hard failure here is
    // usually real (offline, gone). Hammering it makes an offline app slower to
    // say so.
    expect(defaults(makeQueryClient())?.retry).toBe(1);
  });

  it('does not refetch every time the window regains focus', () => {
    // On a desktop app that is every alt-tab, which on a media library is a
    // burst of requests nobody asked for. Polling queries opt back in per call
    // with `refetchInterval`.
    expect(defaults(makeQueryClient())?.refetchOnWindowFocus).toBe(false);
  });

  it('gives each fresh client its own cache', () => {
    const a = makeQueryClient();
    const b = makeQueryClient();
    a.setQueryData(['item', 'x'], { title: 'A' });
    expect(b.getQueryData(['item', 'x'])).toBeUndefined();
  });
});
