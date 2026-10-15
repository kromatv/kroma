// @vitest-environment jsdom
import type { KromaClient } from '@kromatv/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type AskedTitle, useAskForTitle } from './ask-for-title';

const SINTEL: AskedTitle = { kind: 'movie', tmdbId: 45_745, requestStatus: null };

function stub(create: () => Promise<unknown>) {
  const requests = { create: vi.fn(create) };
  return { client: { requests } as unknown as KromaClient, create: requests.create };
}

describe('asking this server for a title it has not got', () => {
  it('asks for every season of it and keeps the status the server answered', async () => {
    const { client, create } = stub(async () => ({ status: 'pending' }));

    const { result } = renderHook(() => useAskForTitle(client, SINTEL));
    act(() => result.current.ask());

    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(create).toHaveBeenCalledWith({ kind: 'movie', tmdbId: 45_745, seasons: null });
  });

  it('reads the status of a request somebody already filed', () => {
    const { client } = stub(async () => ({ status: 'pending' }));

    const { result } = renderHook(() =>
      useAskForTitle(client, { ...SINTEL, requestStatus: 'approved' }),
    );

    expect(result.current.status).toBe('approved');
  });

  it('says so when the server refused, without claiming the title was asked for', async () => {
    const { client } = stub(() => Promise.reject(new Error('denied')));

    const { result } = renderHook(() => useAskForTitle(client, SINTEL));
    act(() => result.current.ask());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.status).toBeNull();
  });

  it('asks nothing before a server has been reached', () => {
    const { result } = renderHook(() => useAskForTitle(null, SINTEL));
    act(() => result.current.ask());

    expect(result.current.asking).toBe(false);
  });
});
