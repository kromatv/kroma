// @vitest-environment jsdom
import type { DiscoverDetail } from '@kromatv/client/discovery';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detail = vi.hoisted(() =>
  vi.fn<(kind: 'movie' | 'tv', tmdbId: number) => Promise<DiscoverDetail>>(),
);

vi.mock('#tv/app/router', () => ({ useClient: () => ({ discovery: { detail } }) }));

import { useDiscoverDetail } from './useDiscoverDetail';

const fiche = (tmdbId: number) =>
  ({ kind: 'movie', tmdbId, title: 'Sintel' }) as unknown as DiscoverDetail;

beforeEach(() => {
  detail.mockReset();
});

describe('useDiscoverDetail', () => {
  it('asks the provider under the id the api spells the kind with', async () => {
    detail.mockResolvedValue(fiche(45_745));

    const { result } = renderHook(() => useDiscoverDetail('show', 1399));

    await waitFor(() => expect(result.current.state).toBe('read'));
    expect(detail).toHaveBeenCalledWith('tv', 1399);
  });

  it('reads as nothing yet before the provider answers', () => {
    detail.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDiscoverDetail('movie', 45_745));

    expect(result.current).toEqual({ state: 'reading' });
  });

  it('hands the fiche over once the provider answers', async () => {
    const read = fiche(45_745);
    detail.mockResolvedValue(read);

    const { result } = renderHook(() => useDiscoverDetail('movie', 45_745));

    await waitFor(() => expect(result.current).toEqual({ state: 'read', detail: read }));
  });

  it('refuses the fiche when the provider cannot be reached', async () => {
    detail.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useDiscoverDetail('movie', 45_745));

    await waitFor(() => expect(result.current).toEqual({ state: 'refused' }));
  });

  it('shows the second title reading rather than the first title it still holds', async () => {
    detail.mockResolvedValue(fiche(45_745));
    const { result, rerender } = renderHook(({ id }) => useDiscoverDetail('movie', id), {
      initialProps: { id: 45_745 },
    });
    await waitFor(() => expect(result.current.state).toBe('read'));

    detail.mockReturnValue(new Promise(() => {}));
    rerender({ id: 603 });

    expect(result.current).toEqual({ state: 'reading' });
  });

  it('drops an answer that lands after the viewer moved on', async () => {
    let answer: (read: DiscoverDetail) => void = () => {};
    detail.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const second = fiche(603);
    const { result, rerender } = renderHook(({ id }) => useDiscoverDetail('movie', id), {
      initialProps: { id: 45_745 },
    });

    detail.mockResolvedValue(second);
    rerender({ id: 603 });
    answer(fiche(45_745));

    await waitFor(() => expect(result.current).toEqual({ state: 'read', detail: second }));
  });
});
