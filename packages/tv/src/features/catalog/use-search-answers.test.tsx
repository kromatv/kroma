// @vitest-environment jsdom

import type { DiscoverResponse } from '@kromatv/client/discovery';
import type { MediaItem, SearchHit, SearchResponse } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider } from '#tv/app/router';
import { useSearchAnswers } from '#tv/features/catalog/use-search-answers.hook';

const noop = () => undefined;

const session = vi.hoisted(() => ({ kids: false }));
vi.mock('#tv/app/providers/auth', () => ({
  useAuthMaybe: () => ({ user: { kids: session.kids } }),
}));

const HIT: SearchHit = {
  type: 'movie',
  item: { id: 'item-1', title: 'Bert' } as unknown as MediaItem,
};
const NOTHING_LOCAL = () => [];
const EMPTY: DiscoverResponse = { results: [], page: 1, totalPages: 1 };

function deferred<T>() {
  let settle: (value: T) => void = noop;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

const provider = vi.hoisted(() => ({ search: vi.fn() }));

function searching(answer: Promise<SearchResponse>) {
  provider.search.mockImplementation(async () => EMPTY);
  const client = fakeClient({
    media: { search: () => answer },
    discovery: { search: provider.search },
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
  session.kids = false;
  provider.search.mockReset();
});

describe('useSearchAnswers', () => {
  it('asks the provider nothing for a Kids session, which never sees a title the server does not hold', async () => {
    vi.useFakeTimers();
    session.kids = true;

    const { result } = searching(Promise.resolve({ query: 'bert', results: [HIT], people: [] }));
    await settles(300);

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.current.library).toEqual([HIT]);
  });

  it('answers the library and the provider for the query that was typed', async () => {
    vi.useFakeTimers();

    const { result } = searching(Promise.resolve({ query: 'bert', results: [HIT], people: [] }));
    await settles(300);

    expect(result.current).toEqual({ query: 'bert', library: [HIT], people: [], discover: [] });
  });

  it('hands over the people whose name the query matches', async () => {
    vi.useFakeTimers();
    const bert = { name: 'Bert Lahr', titles: 2 };

    const { result } = searching(Promise.resolve({ query: 'bert', results: [], people: [bert] }));
    await settles(300);

    expect(result.current.people).toEqual([bert]);
  });

  it('holds the field empty when the answer to a cleared query lands', async () => {
    vi.useFakeTimers();
    const found = deferred<SearchResponse>();

    const { result, rerender } = searching(found.promise);
    await settles(300);
    rerender('');
    found.settle({ query: 'bert', results: [HIT], people: [] });
    await settles(0);

    expect(result.current).toEqual({ query: '', library: [], people: [], discover: [] });
  });
});
