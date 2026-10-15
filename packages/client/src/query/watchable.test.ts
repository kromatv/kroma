import { skipToken } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { WatchableApi } from '../api/watchable';
import { watchableList } from './watchable';

describe('the listing of what can be played right now', () => {
  it('asks the mount the capability answered with', async () => {
    const list = vi.fn().mockResolvedValue({ entries: [] });

    const { queryFn } = watchableList({ list } as unknown as WatchableApi);

    await expect((queryFn as () => Promise<unknown>)()).resolves.toEqual({ entries: [] });
  });

  it('asks for nothing at all where no capability answers', () => {
    expect(watchableList(null).queryFn).toBe(skipToken);
  });

  it('asks for nothing at all before the capability has been read', () => {
    expect(watchableList(undefined).queryFn).toBe(skipToken);
  });
});
