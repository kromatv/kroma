// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const people = vi.fn(async (_name: string) => ({ results: [] as unknown[] }));
  return { people, client: { media: { people } } };
});
vi.mock('#tv/app/router', () => ({ useClient: () => H.client }));

import { usePersonCredits } from './use-person-credits';

const DUNE = { type: 'movie', item: { id: 'm1', title: 'Dune' } };

beforeEach(() => {
  vi.clearAllMocks();
});

it('is nothing until the server answers', () => {
  H.people.mockReturnValue(new Promise(() => undefined));

  const { result } = renderHook(() => usePersonCredits('Denis Villeneuve'));

  expect(result.current).toBeNull();
});

it('is the filmography the server ranks for that name', async () => {
  H.people.mockResolvedValue({ results: [DUNE] });

  const { result } = renderHook(() => usePersonCredits('Denis Villeneuve'));

  await waitFor(() => expect(result.current).toEqual([DUNE]));
  expect(H.people).toHaveBeenCalledWith('Denis Villeneuve');
});

it('reads a failed lookup as no credits', async () => {
  H.people.mockRejectedValue(new Error('offline'));

  const { result } = renderHook(() => usePersonCredits('Denis Villeneuve'));

  await waitFor(() => expect(result.current).toEqual([]));
});

it('forgets the previous filmography the moment the name changes', async () => {
  H.people.mockResolvedValue({ results: [DUNE] });
  const { result, rerender } = renderHook(({ name }) => usePersonCredits(name), {
    initialProps: { name: 'Denis Villeneuve' },
  });
  await waitFor(() => expect(result.current).toEqual([DUNE]));

  H.people.mockReturnValue(new Promise(() => undefined));

  rerender({ name: 'Greta Gerwig' });

  expect(result.current).toBeNull();
});
