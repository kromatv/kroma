import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: { native: object | null } = vi.hoisted(() => ({ native: null }));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => env.native,
}));

async function load() {
  vi.resetModules();
  return import('./device-hardware');
}

beforeEach(() => {
  env.native = null;
});

describe('the address of this set on its network', () => {
  it('is null on a build without the native module', async () => {
    const { localAddress } = await load();

    expect(localAddress()).toBeNull();
  });

  it('is null when the module has no such function', async () => {
    env.native = {};

    const { localAddress } = await load();

    expect(localAddress()).toBeNull();
  });

  it('is null when the set is on no network', async () => {
    env.native = { localAddress: () => null };

    const { localAddress } = await load();

    expect(localAddress()).toBeNull();
  });

  it('is the address the module reads', async () => {
    env.native = { localAddress: () => '192.168.1.20' };

    const { localAddress } = await load();

    expect(localAddress()).toBe('192.168.1.20');
  });
});
