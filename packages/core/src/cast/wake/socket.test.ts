import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webSocket } from './socket';

type Listener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static last: FakeWebSocket;
  readonly sent: string[] = [];
  readonly close = vi.fn();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(text: string) {
    this.sent.push(text);
  }

  fire(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }
}

async function opened() {
  const pending = webSocket('ws://192.168.1.40:3000');
  FakeWebSocket.last.fire('open');
  return { socket: await pending, device: FakeWebSocket.last };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the platform WebSocket as a conversation', () => {
  it('opens to the address given and sends text', async () => {
    const { socket, device } = await opened();

    await socket.send('hello');

    expect(device.url).toBe('ws://192.168.1.40:3000');
    expect(device.sent).toEqual(['hello']);
  });

  it('hands over frames in the order they came, whether asked for before or after', async () => {
    const { socket, device } = await opened();
    device.fire('message', 'one');
    const second = socket.next(1000);
    const first = socket.next(1000);
    device.fire('message', 'two');

    await expect(second).resolves.toBe('one');
    await expect(first).resolves.toBe('two');
  });

  it('reads past a frame that is not text', async () => {
    const { socket, device } = await opened();
    const next = socket.next(1000);

    device.fire('message', new ArrayBuffer(2));
    device.fire('message', 'text');

    await expect(next).resolves.toBe('text');
  });

  it('gives up on a frame that does not come in time', async () => {
    const { socket } = await opened();
    const next = socket.next(1000);
    const failed = expect(next).rejects.toThrow('no answer');

    await vi.advanceTimersByTimeAsync(1000);

    await failed;
  });

  it('fails whoever waits when the device closes, and whoever asks after', async () => {
    const { socket, device } = await opened();
    const waiting = expect(socket.next(1000)).rejects.toThrow('closed');

    device.fire('close');

    await waiting;
    await expect(socket.next(1000)).rejects.toThrow('closed');
  });

  it('closes the platform socket', async () => {
    const { socket, device } = await opened();

    socket.close();

    expect(device.close).toHaveBeenCalledOnce();
  });

  it('is refused when the device does not accept the connection', async () => {
    const pending = webSocket('wss://192.168.1.40:3001');
    const failed = expect(pending).rejects.toThrow('no answer');

    FakeWebSocket.last.fire('error');

    await failed;
  });

  it('is refused when the device does not answer in four seconds', async () => {
    const pending = webSocket('ws://192.168.1.40:3000');
    const failed = expect(pending).rejects.toThrow('no answer');

    await vi.advanceTimersByTimeAsync(4000);

    await failed;
    expect(FakeWebSocket.last.close).toHaveBeenCalledOnce();
  });
});
