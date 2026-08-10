import Module from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Loader = (request: string, ...rest: unknown[]) => unknown;
const loader = Module as unknown as { _load: Loader };
const realLoad = loader._load;

function withExpoNetwork(stub: unknown): void {
  loader._load = (request, ...rest) =>
    request === 'expo-network' ? stub : realLoad.call(Module, request, ...rest);
}

async function freshImport(): Promise<typeof import('./localIp')> {
  vi.resetModules();
  return import('./localIp');
}

afterEach(() => {
  loader._load = realLoad;
  vi.resetModules();
});

describe('on a build where expo-network cannot be loaded', () => {
  it('imports without throwing', async () => {
    const { getDeviceLocalIp } = await freshImport();
    expect(getDeviceLocalIp).toBeTypeOf('function');
  });

  it('reports no address instead of failing', async () => {
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('keeps answering, rather than retrying a module it knows is absent', async () => {
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });
});

describe('on a build that has the native module', () => {
  it('reports the address the OS hands over', async () => {
    withExpoNetwork({ getIpAddressAsync: async () => '192.168.1.42' });
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBe('192.168.1.42');
  });

  it('reads the unroutable placeholder as no address at all', async () => {
    withExpoNetwork({ getIpAddressAsync: async () => '0.0.0.0' });
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('reads an empty answer as no address', async () => {
    withExpoNetwork({ getIpAddressAsync: async () => '' });
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('reports no address when the OS refuses the question', async () => {
    withExpoNetwork({
      getIpAddressAsync: async () => {
        throw new Error('permission denied');
      },
    });
    const { getDeviceLocalIp } = await freshImport();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('asks the OS again on every call, since the phone changes networks', async () => {
    const getIpAddressAsync = vi.fn(async () => '10.0.0.5');
    withExpoNetwork({ getIpAddressAsync });
    const { getDeviceLocalIp } = await freshImport();

    await getDeviceLocalIp();
    await getDeviceLocalIp();
    expect(getIpAddressAsync).toHaveBeenCalledTimes(2);
  });
});
