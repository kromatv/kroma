// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const personDetails = vi.hoisted(() =>
  vi.fn(async (_name: string) => ({ person: null as unknown })),
);
const client = vi.hoisted(() => ({ current: { personDetails } }));
vi.mock('#tv/app/router', () => ({ useClient: () => client.current }));

import { usePersonDetail } from './usePersonDetail';

const DENIS = { name: 'Denis Villeneuve', biography: 'Born in Bécancour.' };
const GRETA = { name: 'Greta Gerwig', biography: 'Born in Sacramento.' };

beforeEach(() => {
  vi.clearAllMocks();
  client.current = { personDetails };
  personDetails.mockResolvedValue({ person: null });
});

describe('what it reports', () => {
  it('is nothing until the server answers', () => {
    personDetails.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    expect(result.current).toBeNull();
  });

  it('is the biography once it arrives', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { result } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(result.current).toEqual(DENIS));
  });

  it('asks about the name it was given', async () => {
    renderHook(() => usePersonDetail('Greta Gerwig'));
    await waitFor(() => expect(personDetails).toHaveBeenCalledWith('Greta Gerwig'));
  });

  it('stays null when the server has nothing', async () => {
    personDetails.mockResolvedValue({ person: null });
    const { result } = renderHook(() => usePersonDetail('Uncredited'));
    await waitFor(() => expect(personDetails).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('stays null when the response omits the person entirely', async () => {
    personDetails.mockResolvedValue({} as { person: unknown });
    const { result } = renderHook(() => usePersonDetail('Nobody'));
    await waitFor(() => expect(personDetails).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('stays null, and quiet, when the request fails', async () => {
    personDetails.mockRejectedValue(new Error('no TMDB key'));
    const { result } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(personDetails).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

describe('walking from one person to another', () => {
  it('FORGETS the previous biography immediately', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { result, rerender } = renderHook(({ name }) => usePersonDetail(name), {
      initialProps: { name: 'Denis Villeneuve' },
    });
    await waitFor(() => expect(result.current).toEqual(DENIS));

    personDetails.mockReturnValue(new Promise(() => undefined));
    rerender({ name: 'Greta Gerwig' });
    expect(result.current).toBeNull();
  });

  it('shows the new biography when it arrives', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { result, rerender } = renderHook(({ name }) => usePersonDetail(name), {
      initialProps: { name: 'Denis Villeneuve' },
    });
    await waitFor(() => expect(result.current).toEqual(DENIS));

    personDetails.mockResolvedValue({ person: GRETA });
    rerender({ name: 'Greta Gerwig' });
    await waitFor(() => expect(result.current).toEqual(GRETA));
  });

  it('does not answer for a person the user has left', async () => {
    const holder: { fire: ((value: { person: unknown }) => void) | null } = { fire: null };
    personDetails.mockImplementation(
      () =>
        new Promise<{ person: unknown }>((resolve) => {
          holder.fire = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ name }) => usePersonDetail(name), {
      initialProps: { name: 'Denis Villeneuve' },
    });
    await waitFor(() => expect(personDetails).toHaveBeenCalled());

    rerender({ name: 'Greta Gerwig' });
    holder.fire?.({ person: DENIS });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('asks again when the client changes', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { rerender } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(personDetails).toHaveBeenCalledOnce());

    client.current = { personDetails };
    rerender();
    await waitFor(() => expect(personDetails).toHaveBeenCalledTimes(2));
  });

  it('does not ask again on an ordinary re-render', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { rerender } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(personDetails).toHaveBeenCalledOnce());
    rerender();
    rerender();
    expect(personDetails).toHaveBeenCalledOnce();
  });

  it('writes nothing after the screen is gone', async () => {
    const holder: { fire: ((value: { person: unknown }) => void) | null } = { fire: null };
    personDetails.mockImplementation(
      () =>
        new Promise<{ person: unknown }>((resolve) => {
          holder.fire = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(personDetails).toHaveBeenCalled());

    unmount();
    holder.fire?.({ person: DENIS });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
