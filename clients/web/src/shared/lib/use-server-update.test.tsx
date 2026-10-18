// @vitest-environment jsdom
import { createQueryClient } from '@kromatv/client/query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createWebRuntime } from './api';
import { useServerUpdate } from './use-server-update';
import { WebRuntimeProvider } from './web-runtime';

afterEach(() => vi.unstubAllGlobals());

it('keeps queue events on their owning server and closes the subscription on unmount', () => {
  const sockets: Socket[] = [];
  class Socket {
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    close = vi.fn();
    constructor(
      readonly url: string,
      readonly protocol: string,
    ) {
      sockets.push(this);
    }
  }
  vi.stubGlobal('WebSocket', Socket);
  const a = createWebRuntime({
    client: createQueryClient({ baseUrl: 'http://a.test', authToken: 'a' }),
  });
  const b = createWebRuntime({
    client: createQueryClient({ baseUrl: 'http://b.test', authToken: 'b' }),
  });
  const reloadA = vi.fn();
  const reloadB = vi.fn();
  const first = renderHook(() => useServerUpdate('report.updated', reloadA), {
    wrapper: ({ children }) => <WebRuntimeProvider value={a}>{children}</WebRuntimeProvider>,
  });
  const second = renderHook(() => useServerUpdate('request.updated', reloadB), {
    wrapper: ({ children }) => <WebRuntimeProvider value={b}>{children}</WebRuntimeProvider>,
  });
  expect(sockets.map(({ url, protocol }) => [url, protocol])).toEqual([
    ['ws://a.test/api/events', 'kroma.session.a'],
    ['ws://b.test/api/events', 'kroma.session.b'],
  ]);
  act(() => {
    sockets[0]?.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify({ type: 'report.updated' }) }),
    );
    sockets[1]?.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify({ type: 'report.updated' }) }),
    );
  });
  expect(reloadA).toHaveBeenCalledOnce();
  expect(reloadB).not.toHaveBeenCalled();
  first.unmount();
  expect(sockets[0]?.close).toHaveBeenCalledOnce();
  expect(sockets[1]?.close).not.toHaveBeenCalled();
  second.unmount();
  a.queryClient.clear();
  b.queryClient.clear();
});
