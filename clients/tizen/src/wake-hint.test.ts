import { afterEach, describe, expect, it, vi } from 'vitest';
import { tizenWakeHint } from './wake-hint';

afterEach(() => {
  vi.unstubAllGlobals();
});

function network(ipAddress: string) {
  return {
    getPropertyValue: (_property: string, found: (value: { ipAddress: string }) => void) => {
      found({ ipAddress });
    },
  };
}

describe('what a Samsung set says about reaching itself', () => {
  it('reads the hardware address, the app id and the address on the network', async () => {
    vi.stubGlobal('webapis', { network: { getMac: () => 'A0:B1:C2:D3:E4:F5' } });
    vi.stubGlobal('tizen', {
      application: { getCurrentApplication: () => ({ appInfo: { id: 'KromaTV001.KROMA' } }) },
      systeminfo: network('192.168.1.20'),
    });

    const hint = await tizenWakeHint();

    expect(hint).toEqual({
      mac: 'A0:B1:C2:D3:E4:F5',
      appId: 'KromaTV001.KROMA',
      address: '192.168.1.20',
    });
  });

  it('leaves out what a firmware refuses to say', async () => {
    vi.stubGlobal('webapis', {
      network: {
        getMac: () => {
          throw new Error('SecurityError');
        },
      },
    });
    vi.stubGlobal('tizen', { systeminfo: network('192.168.1.20') });

    const hint = await tizenWakeHint();

    expect(hint).toEqual({ mac: undefined, appId: undefined, address: '192.168.1.20' });
  });
});
