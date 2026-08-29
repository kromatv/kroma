import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KromaClient } from './api';
import { KromaEvents } from './events';
import { FakeWS, WSImpl } from './events.fixture';

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  FakeWS.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('KromaEvents bearer refresh', () => {
  it('refreshes once and reconnects with the bearer the handler returned', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const events = new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(2);
    expect(FakeWS.instances[1]?.protocol).toBe('kroma.session.fresh');
    events.close();
  });

  it('leaves a socket that had opened on the plain backoff', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'live',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onopen?.();
    FakeWS.instances[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(refresh).not.toHaveBeenCalled();
    expect(FakeWS.instances).toHaveLength(2);
    events.close();
  });

  it('exchanges no second bearer while the refreshed one keeps being refused', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    FakeWS.instances[1]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(3);
    expect(FakeWS.instances[2]?.protocol).toBe('kroma.session.expired');
    events.close();
  });

  it('falls back to the backoff when the refresh mints no bearer', async () => {
    const refresh = vi.fn(async () => undefined);
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    const immediate = FakeWS.instances.length;
    await vi.advanceTimersByTimeAsync(1000);
    FakeWS.instances[1]?.onclose?.();
    await vi.advanceTimersByTimeAsync(2000);

    expect(immediate).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(3);
    events.close();
  });

  it('treats a refresh that rejects as no bearer at all', async () => {
    const refresh = vi.fn(() => Promise.reject(new Error('unreachable')));
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    const immediate = FakeWS.instances.length;
    await vi.advanceTimersByTimeAsync(1000);

    expect(immediate).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(2);
    events.close();
  });

  it('allows another exchange once the socket has opened in between', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    FakeWS.instances[1]?.onopen?.();
    FakeWS.instances[1]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);
    FakeWS.instances[2]?.onclose?.();
    await flush();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(FakeWS.instances).toHaveLength(4);
    expect(FakeWS.instances[3]?.protocol).toBe('kroma.session.fresh');
    events.close();
  });

  it('keeps the refreshed bearer when the socket constructor throws', async () => {
    let throwOnConstruct = false;
    class FlakyWS extends FakeWS {
      constructor(url: string, protocol?: string) {
        super(url, protocol);
        if (throwOnConstruct) throw new Error('cannot open');
      }
    }

    const refresh = vi.fn(async () => {
      throwOnConstruct = true;
      return 'fresh';
    });
    const events = new KromaEvents('http://h', {
      WebSocketImpl: FlakyWS as unknown as typeof WebSocket,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    throwOnConstruct = false;
    await vi.advanceTimersByTimeAsync(1000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(3);
    expect(FakeWS.instances[2]?.protocol).toBe('kroma.session.fresh');
    events.close();
  });

  it('refreshes nothing for a socket the caller has already closed', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    const ws = FakeWS.instances[0];
    events.close();
    ws?.onclose?.();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refresh).not.toHaveBeenCalled();
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('abandons an in-flight refresh when the caller closes the socket', async () => {
    let handOver: (token: string | undefined) => void = () => undefined;
    const refresh = vi.fn(
      () =>
        new Promise<string | undefined>((resolve) => {
          handOver = resolve;
        }),
    );
    const events = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
      refresh,
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    events.close();
    handOver('fresh');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(1);
  });
});

describe('a socket given no refresh of its own', () => {
  it('mints a bearer through the handler the client registered', async () => {
    const client = new KromaClient({ baseUrl: 'http://host:4040' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    const events = new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => 'expired',
    });

    events.connect();
    FakeWS.instances[0]?.onclose?.();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances[1]?.protocol).toBe('kroma.session.fresh');

    client.setRefreshHandler(undefined);
    events.close();
  });
});
