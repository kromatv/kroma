// @vitest-environment jsdom
//
// The biography behind a name on the person screen.
//
// What makes this worth a test is everything it deliberately does NOT do. There
// is no loading flag and a miss is not an error, because the screen is a
// filmography first - drawn instantly from the catalogue that is already
// loaded - and the biography arrives late, or never (no TMDB key, an uncredited
// name). The header simply grows a paragraph when it does.
//
// The one thing it must do eagerly is FORGET. The person screen is reused across
// `person` routes, so walking from one name to another keeps the same component
// mounted: without clearing first, one person's life sits under another's name
// for the length of a request. That is worse than showing none, and it is the
// kind of thing that looks like a caching bug on a television and is never
// reproduced at a desk.

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
    // No loading flag on purpose: the filmography is already on screen.
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
    // A miss is not an error state; the header just has no paragraph.
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
    // No error surface exists on this screen, so a rejection must resolve to
    // "no biography" rather than to an unhandled rejection.
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

    // The screen is reused across routes, so the component does not remount.
    personDetails.mockReturnValue(new Promise(() => undefined));
    rerender({ name: 'Greta Gerwig' });
    // Showing one person's life under another's name for the length of a
    // request is worse than showing none.
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
    // The first request lands after the user has already moved on.
    holder.fire?.({ person: DENIS });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('asks again when the client changes', async () => {
    personDetails.mockResolvedValue({ person: DENIS });
    const { rerender } = renderHook(() => usePersonDetail('Denis Villeneuve'));
    await waitFor(() => expect(personDetails).toHaveBeenCalledOnce());

    // Switching server is switching catalogue: the same name is a different
    // person's record.
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
