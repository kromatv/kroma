// @vitest-environment jsdom
import type { WatchableApi } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { arrived, PROBE, TARGET, TICKET, target } from './watch.fixture';
import { useWatchScreen } from './watch-screen';

function stub() {
  const probe = vi.fn().mockResolvedValue(PROBE);
  const ticket = vi.fn().mockResolvedValue(TICKET);
  const progress = vi.fn().mockResolvedValue(arrived());
  return { watchable: { probe, ticket, progress } as unknown as WatchableApi, probe, progress };
}

describe('the screen one download in flight is watched on', () => {
  it('reaches a playable stage carrying the probe and the credential', async () => {
    const { watchable } = stub();

    const { result } = renderHook(() => useWatchScreen({ watchable, target: TARGET }));

    await waitFor(() => expect(result.current.playable).not.toBeNull());
    expect(result.current.playable).toMatchObject({ probe: PROBE, ticket: TICKET });
  });

  it('polls the arrival figures for the file it is following', async () => {
    const { watchable, progress } = stub();

    const { result } = renderHook(() => useWatchScreen({ watchable, target: TARGET }));

    await waitFor(() => expect(result.current.progress).toEqual(arrived()));
    expect(progress).toHaveBeenCalledWith(TARGET.entry.id, TARGET.file.index, 120);
  });

  it('offers nothing where no module answers the capability', () => {
    const { result } = renderHook(() => useWatchScreen({ watchable: null, target: TARGET }));

    expect(result.current.stage).toEqual({
      stage: 'failed',
      failure: 'unsupported',
      message: null,
    });
  });

  it('keeps waiting on a server whose capability map has not been read', () => {
    const { result } = renderHook(() => useWatchScreen({ watchable: undefined, target: null }));

    expect(result.current.stage.stage).toBe('connecting');
  });

  it('keeps the playable stage and its target whole once the picture is up', async () => {
    const { watchable } = stub();

    const { result, rerender } = renderHook(() => useWatchScreen({ watchable, target: target() }));
    await waitFor(() => expect(result.current.playable).not.toBeNull());
    const first = result.current.playable;
    rerender();

    expect(result.current.playable).toBe(first);
    expect(result.current.target).toBe(first?.target);
  });
});
