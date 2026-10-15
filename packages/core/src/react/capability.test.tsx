// @vitest-environment jsdom
import type { Capabilities } from '@kromatv/client/capabilities';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCapability } from './capability';

const MOUNT = '/api/module/tv.kroma.torrents';
const TORRENTS: Capabilities = { watchable: { mount: MOUNT } };

type Read = () => Promise<Capabilities>;

function server(answer: Read = async () => TORRENTS) {
  const read = vi.fn<Read>(answer);
  let sessionToken: string | undefined = 'first-account';
  const client = {
    capabilities: { read },
    get sessionToken() {
      return sessionToken;
    },
  };
  return {
    read,
    client,
    signIn: (next: string) => {
      sessionToken = next;
    },
  };
}

const mount = (_client: unknown, capabilities: Capabilities) =>
  capabilities.watchable ? { mount: capabilities.watchable.mount } : null;

describe('what a server says it can do', () => {
  it('is neither a mount nor a refusal until the map has been read', () => {
    const { client } = server();

    const { result } = renderHook(() => useCapability(client, mount));

    expect(result.current).toBeUndefined();
  });

  it('is what the capability answers once the map has been read', async () => {
    const { client } = server();

    const { result } = renderHook(() => useCapability(client, mount));

    await waitFor(() => expect(result.current).toEqual({ mount: MOUNT }));
  });

  it('is nothing on a server whose map does not name the capability', async () => {
    const { client } = server(async () => ({}));

    const { result } = renderHook(() => useCapability(client, mount));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it('is nothing on a read the server refused, rather than waiting forever', async () => {
    const { client } = server(async () => {
      throw new Error('503');
    });

    const { result } = renderHook(() => useCapability(client, mount));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it('is read once however many screens ask the same server', async () => {
    const { read, client } = server();

    const { result } = renderHook(() => [
      useCapability(client, mount),
      useCapability(client, mount),
    ]);

    await waitFor(() => expect(result.current[0]).not.toBeUndefined());
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps the same answer across renders, so nothing built from it is rebuilt', async () => {
    const { client } = server();

    const { result, rerender } = renderHook(() =>
      useCapability(client, (c, caps) => mount(c, caps)),
    );
    await waitFor(() => expect(result.current).not.toBeUndefined());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  it('is read again for the account that signs in next', async () => {
    const { read, client, signIn } = server();

    const { result, rerender } = renderHook(() => useCapability(client, mount));
    await waitFor(() => expect(result.current).toEqual({ mount: MOUNT }));
    signIn('second-account');
    rerender();

    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('is asked for again after a refused read rather than answering nothing for good', async () => {
    let asked = 0;
    const { client, signIn } = server(async () => {
      asked += 1;
      if (asked === 1) throw new Error('503');
      return TORRENTS;
    });

    const { result, rerender } = renderHook(() => useCapability(client, mount));
    await waitFor(() => expect(result.current).toBeNull());
    signIn('second-account');
    rerender();

    await waitFor(() => expect(result.current).toEqual({ mount: MOUNT }));
  });

  it('asks nothing at all of a server nobody has reached', () => {
    const { read } = server();

    const { result } = renderHook(() => useCapability(null, mount));

    expect(result.current).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
