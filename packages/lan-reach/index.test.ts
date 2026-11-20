import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hasNative: true }));

const native = vi.hoisted(() => ({
  open: vi.fn(async () => 7),
  send: vi.fn(async () => undefined),
  receive: vi.fn(async () => 'frame'),
  close: vi.fn(async () => undefined),
  magic: vi.fn(async () => undefined),
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (env.hasNative ? native : null),
}));

async function load() {
  vi.resetModules();
  return import('./index.ts');
}

const SERVICE = 'wss://192.168.1.20:8002/remote';

beforeEach(() => {
  env.hasNative = true;
  vi.clearAllMocks();
  native.close.mockResolvedValue(undefined);
});

describe('a build without the native half', () => {
  it('has no reach beyond a page', async () => {
    env.hasNative = false;
    const { lanReach } = await load();

    expect(lanReach()).toBeNull();
  });
});

describe('a conversation with a television', () => {
  it('is opened by the native half, and every call names the socket it gave', async () => {
    const { lanReach } = await load();

    const socket = await lanReach()?.open(SERVICE);
    await socket?.send('hello');
    const frame = await socket?.next(8000);
    socket?.close();

    expect(native.open).toHaveBeenCalledExactlyOnceWith(SERVICE);
    expect(native.send).toHaveBeenCalledExactlyOnceWith(7, 'hello');
    expect(native.receive).toHaveBeenCalledExactlyOnceWith(7, 8000);
    expect(frame).toBe('frame');
    expect(native.close).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('is refused when the television does not answer', async () => {
    native.open.mockRejectedValueOnce(new Error('no answer'));
    const { lanReach } = await load();

    await expect(lanReach()?.open(SERVICE)).rejects.toThrow('no answer');
  });

  it('closes without a complaint when the socket is already gone', async () => {
    native.close.mockRejectedValue(new Error('gone'));
    const { lanReach } = await load();
    const socket = await lanReach()?.open(SERVICE);

    expect(() => socket?.close()).not.toThrow();
  });
});

describe('the packet', () => {
  it('is sent by the native half', async () => {
    const { lanReach } = await load();

    await lanReach()?.magic('a0:b1:c2:d3:e4:f5');

    expect(native.magic).toHaveBeenCalledExactlyOnceWith('a0:b1:c2:d3:e4:f5');
  });
});
