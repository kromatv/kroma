// @vitest-environment jsdom

import type { DiscoverResponse } from '@kromatv/client/discovery';
import type { MediaItem, SearchHit, SearchResponse } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider } from '#tv/app/router';
import { useSearchAnswers } from '#tv/features/catalog/useSearchAnswers';

const HIT: SearchHit = {
  type: 'movie',
  item: { id: 'item-1', title: 'Bert' } as unknown as MediaItem,
};
const NOTHING_LOCAL = () => [];
const EMPTY: DiscoverResponse = { results: [], page: 1, totalPages: 1 };

function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

function searching(answer: Promise<SearchResponse>) {
  const client = fakeClient({
    media: { search: () => answer },
    discovery: { search: async () => EMPTY },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <TvClientProvider client={client}>{children}</TvClientProvider>
  );
  return renderHook((typed: string) => useSearchAnswers(typed, NOTHING_LOCAL), {
    initialProps: 'bert',
    wrapper,
  });
}

const settles = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

afterEach(() => {
  vi.useRealTimers();
});

describe('useSearchAnswers', () => {
  it('answers the library and the provider for the query that was typed', async () => {
    vi.useFakeTimers();

    const { result } = searching(Promise.resolve({ query: 'bert', results: [HIT] }));
    await settles(300);

    expect(result.current).toEqual({ query: 'bert', library: [HIT], discover: [] });
  });

  it('holds the field empty when the answer to a cleared query lands', async () => {
    vi.useFakeTimers();
    const found = deferred<SearchResponse>();

    const { result, rerender } = searching(found.promise);
    await settles(300);
    rerender('');
    found.settle({ query: 'bert', results: [HIT] });
    await settles(0);

    expect(result.current).toEqual({ query: '', library: [], discover: [] });
  });
});
