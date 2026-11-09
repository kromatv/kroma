// @vitest-environment jsdom
import { recordingClient } from '@kromatv/client/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDirectConnection } from './direct-connection';

const LAN = 'http://192.168.1.2:4040';
const OFFER = { instanceId: 'srv-1', routes: [LAN], nonce: 'n1', answer: 'a1', sameNetwork: true };

afterEach(() => {
  vi.unstubAllGlobals();
});

function serverAt(network: { up: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!network.up) throw new TypeError('Failed to fetch');
      const body = url.endsWith('/api/health')
        ? { status: 'ok', instanceId: 'srv-1' }
        : { answer: 'a1' };
      return new Response(JSON.stringify(body));
    }),
  );
  return recordingClient(() => ({ json: OFFER }), { baseUrl: 'https://kroma.example' }).client;
}

describe('useDirectConnection', () => {
  it('takes the direct route once signed in and reports it', async () => {
    const client = serverAt({ up: true });

    const { result } = renderHook(() => useDirectConnection(client, true));

    await waitFor(() => expect(result.current.route).toBe(LAN));
    expect(client.route.api()).toBe(LAN);
  });

  it('stays on the configured base while signed out', async () => {
    const client = serverAt({ up: true });

    const { result } = renderHook(() => useDirectConnection(client, false));
    await act(() => Promise.resolve());

    expect(result.current.route).toBeUndefined();
    expect(client.route.direct()).toBeUndefined();
  });

  it('asks again when the shell says the network changed', async () => {
    const network = { up: false };
    const client = serverAt(network);
    let changed = () => {};
    const onNetworkChange = (listener: () => void) => {
      changed = listener;
      return () => {};
    };
    const { result } = renderHook(() => useDirectConnection(client, true, { onNetworkChange }));
    await act(() => Promise.resolve());

    network.up = true;
    act(() => changed());

    await waitFor(() => expect(result.current.route).toBe(LAN));
  });
});
