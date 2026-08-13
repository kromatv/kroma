import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KromaEvents, type ServerEvent } from './events';

// A controllable WebSocket stand-in. Each construction is recorded so tests can
// drive its lifecycle callbacks by hand.
class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  protocol: string | undefined;
  readyState = 0;
  sent: string[] = [];
  sendThrows = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string, protocol?: string) {
    this.url = url;
    this.protocol = protocol;
    FakeWS.instances.push(this);
  }
  send(data: string): void {
    if (this.sendThrows) throw new Error('socket buffer full');
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

const WSImpl = FakeWS as unknown as typeof WebSocket;

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('KromaEvents URL', () => {
  it('maps http to ws and appends /api/events', () => {
    new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    }).connect();
    expect(FakeWS.instances[0]?.url).toBe('ws://host:4040/api/events');
  });

  it('maps https to wss and strips a trailing slash', () => {
    new KromaEvents('https://host/', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    }).connect();
    expect(FakeWS.instances[0]?.url).toBe('wss://host/api/events');
  });
});

describe('KromaEvents handshake', () => {
  it('carries the bearer as a subprotocol, since a browser cannot set a header', () => {
    new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 'tok',
    }).connect();
    expect(FakeWS.instances[0]?.protocol).toBe('kroma.session.tok');
  });

  it('opens no socket at all when there is no token', () => {
    // The server refuses an upgrade carrying no session subprotocol, so there
    // is nothing to gain by opening one.
    new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => undefined,
    }).connect();
    expect(FakeWS.instances).toHaveLength(0);
  });

  it('does nothing on a runtime with no WebSocket at all', () => {
    const real = globalThis.WebSocket;
    (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = undefined;
    try {
      expect(() => new KromaEvents('http://h').connect()).not.toThrow();
      expect(FakeWS.instances).toHaveLength(0);
    } finally {
      globalThis.WebSocket = real;
    }
  });

  it('refuses to reconnect after close()', () => {
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    });
    ev.close();
    ev.connect();
    expect(FakeWS.instances).toHaveLength(0);
  });
});

describe('KromaEvents send', () => {
  it('reports the socket closed rather than dropping the message silently', () => {
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    });
    expect(ev.open).toBe(false);
    expect(ev.send({ type: 'cast.ack' } as never)).toBe(false);
    ev.connect();
    expect(ev.send({ type: 'cast.ack' } as never)).toBe(false);
  });

  it('serializes the message once the socket is open', () => {
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    });
    ev.connect();
    const ws = FakeWS.instances[0];
    if (ws) ws.readyState = 1;
    expect(ev.open).toBe(true);
    expect(ev.send({ type: 'cast.ack', seq: 3 } as never)).toBe(true);
    expect(ws?.sent).toEqual([JSON.stringify({ type: 'cast.ack', seq: 3 })]);
  });

  it('reports false when the socket rejects the write', () => {
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    });
    ev.connect();
    const ws = FakeWS.instances[0];
    if (ws) {
      ws.readyState = 1;
      ws.sendThrows = true;
    }
    expect(ev.send({ type: 'cast.ack' } as never)).toBe(false);
  });
});

describe('KromaEvents messages', () => {
  it('parses a JSON frame and forwards the typed event', () => {
    const onEvent = vi.fn();
    new KromaEvents('http://h', { WebSocketImpl: WSImpl, token: () => 't', onEvent }).connect();
    const ws = FakeWS.instances[0];
    ws?.onmessage?.({ data: JSON.stringify({ type: 'hello', version: '9' }) } as MessageEvent);
    expect(onEvent).toHaveBeenCalledWith({ type: 'hello', version: '9' } as ServerEvent);
  });

  it('ignores malformed and non-string frames', () => {
    const onEvent = vi.fn();
    new KromaEvents('http://h', { WebSocketImpl: WSImpl, token: () => 't', onEvent }).connect();
    const ws = FakeWS.instances[0];
    ws?.onmessage?.({ data: '{not json' } as MessageEvent);
    ws?.onmessage?.({ data: { some: 'object' } } as unknown as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('KromaEvents lifecycle', () => {
  it('invokes onOpen when the socket opens', () => {
    const onOpen = vi.fn();
    const ev = new KromaEvents('http://h', { WebSocketImpl: WSImpl, token: () => 't', onOpen });
    ev.connect();
    FakeWS.instances[0]?.onopen?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
    ev.close();
  });

  it('onerror closes the socket', () => {
    new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    }).connect();
    const ws = FakeWS.instances[0];
    ws?.onerror?.();
    expect(ws?.closed).toBe(true);
  });

  it('reconnects with backoff after a close and calls onClose', () => {
    const onClose = vi.fn();
    const ev = new KromaEvents('http://h', { WebSocketImpl: WSImpl, token: () => 't', onClose });
    ev.connect();
    FakeWS.instances[0]?.onclose?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(FakeWS.instances).toHaveLength(1); // reconnect is scheduled, not immediate
    vi.advanceTimersByTime(1000); // first backoff = 1000ms
    expect(FakeWS.instances).toHaveLength(2);
    ev.close();
  });

  it('stops reconnecting once closed', () => {
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: WSImpl,
      token: () => 't',
    });
    ev.connect();
    const ws = FakeWS.instances[0];
    ev.close();
    expect(ws?.closed).toBe(true);
    ws?.onclose?.(); // a late close event must not schedule another connect
    vi.advanceTimersByTime(60000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('schedules a reconnect when the WebSocket constructor throws', () => {
    class ThrowingWS {
      constructor() {
        throw new Error('cannot open');
      }
    }
    const ev = new KromaEvents('http://h', {
      WebSocketImpl: ThrowingWS as unknown as typeof WebSocket,
    });
    expect(() => ev.connect()).not.toThrow();
    ev.close();
  });
});

describe('KromaEvents auth', () => {
  it('waits for the bearer instead of opening a socket the server will refuse', () => {
    // The bearer lives in memory only, so a reload has none until the stored
    // access token has been exchanged. An upgrade without it is a guaranteed
    // 401, and opening one anyway is what made the console a reconnect loop.
    let token: string | undefined;
    const events = new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => token,
    });
    events.connect();
    expect(FakeWS.instances).toHaveLength(0);

    vi.advanceTimersByTime(150);
    expect(FakeWS.instances).toHaveLength(0);

    token = 'later';
    vi.advanceTimersByTime(300); // second wait, one rung up the ladder
    expect(FakeWS.instances).toHaveLength(1);
    expect(FakeWS.instances[0]?.protocol).toBe('kroma.session.later');
  });

  it('backs the token wait off to the ceiling instead of polling all outage', () => {
    // A television that boots with the server unreachable is signed in with no
    // bearer and stays that way: a fixed re-check would wake it ~7 times a
    // second for the whole outage.
    let token: string | undefined;
    const events = new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => token,
      maxBackoffMs: 1200,
    });
    events.connect();
    // 150 + 300 + 600 + 1200 climbs to the ceiling, and stays there.
    vi.advanceTimersByTime(150 + 300 + 600 + 1200);
    token = 'finally';
    vi.advanceTimersByTime(1199);
    expect(FakeWS.instances).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(1);
    events.close();
  });

  it('does not spend its reconnect backoff while it has no bearer', () => {
    // Waiting is not failing: escalating the backoff here would leave a freshly
    // loaded page seconds away from its first event for no reason.
    const events = new KromaEvents('http://host:4040', {
      WebSocketImpl: WSImpl,
      token: () => undefined,
    });
    events.connect();
    vi.advanceTimersByTime(150 * 5);
    expect(FakeWS.instances).toHaveLength(0);
    events.close();
  });
});
