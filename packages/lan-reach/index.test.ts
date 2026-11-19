import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hasNative: true }));

const native = vi.hoisted(() => ({
  samsungKey: vi.fn(async (): Promise<string | null> => null),
  magic: vi.fn(async () => undefined),
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (env.hasNative ? native : null),
}));

async function load() {
  vi.resetModules();
  return import('./index.ts');
}

function memory(start: Record<string, string> = {}) {
  const held = new Map(Object.entries(start));
  return {
    get: vi.fn(async (address: string) => held.get(address) ?? null),
    set: vi.fn(async (address: string, token: string) => {
      held.set(address, token);
    }),
    held,
  };
}

const TV = '192.168.1.20';

beforeEach(() => {
  env.hasNative = true;
  native.samsungKey.mockReset().mockResolvedValue(null);
  native.magic.mockClear();
});

describe('a build without the native half', () => {
  it('has no reach beyond HTTP', async () => {
    env.hasNative = false;
    const { lanReach } = await load();

    expect(lanReach(memory())).toBeNull();
  });
});

describe('pressing a key on a Samsung set', () => {
  it('sends the token the set gave the last time', async () => {
    const { lanReach } = await load();
    const tokens = memory({ [TV]: 'given-before' });

    await lanReach(tokens)?.samsungKey(TV, 'KEY_POWER');

    expect(native.samsungKey).toHaveBeenCalledExactlyOnceWith(TV, 'KEY_POWER', 'given-before');
  });

  it('sends no token to a set that never gave one, and keeps the one it gives', async () => {
    native.samsungKey.mockResolvedValue('just-given');
    const { lanReach } = await load();
    const tokens = memory();

    await lanReach(tokens)?.samsungKey(TV, 'KEY_POWER');

    expect(native.samsungKey).toHaveBeenCalledExactlyOnceWith(TV, 'KEY_POWER', null);
    expect(tokens.held.get(TV)).toBe('just-given');
  });

  it('keeps the token it has when the set gives none back', async () => {
    const { lanReach } = await load();
    const tokens = memory({ [TV]: 'given-before' });

    await lanReach(tokens)?.samsungKey(TV, 'KEY_POWER');

    expect(tokens.set).not.toHaveBeenCalled();
  });
});

describe('the Wake-on-LAN packet', () => {
  it('is handed to the native half with the hardware address', async () => {
    const { lanReach } = await load();

    await lanReach(memory())?.magic('a0:b1:c2:d3:e4:f5');

    expect(native.magic).toHaveBeenCalledExactlyOnceWith('a0:b1:c2:d3:e4:f5');
  });
});
