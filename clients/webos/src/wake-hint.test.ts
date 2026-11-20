import { afterEach, describe, expect, it, vi } from 'vitest';
import { webOsWakeHint } from './wake-hint';

const calls: Array<{ uri: string; payload: string }> = [];

function bus(reply: string) {
  return class {
    onservicecallback: ((message: string) => void) | null = null;
    call(uri: string, payload: string) {
      calls.push({ uri, payload });
      this.onservicecallback?.(reply);
    }
  };
}

const LINK = JSON.stringify({
  returnValue: true,
  address: '192.168.1.40',
  mac: 'a0:b1:c2:d3:e4:f5',
});

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('what an LG set says about reaching itself', () => {
  it('asks its own service for the network and reads its id off the platform', async () => {
    vi.stubGlobal('PalmServiceBridge', bus(LINK));
    vi.stubGlobal('PalmSystem', { identifier: 'tv.kroma.webos 1042' });

    const hint = await webOsWakeHint();

    expect(hint).toEqual({
      mac: 'a0:b1:c2:d3:e4:f5',
      address: '192.168.1.40',
      appId: 'tv.kroma.webos',
    });
    expect(calls).toEqual([{ uri: 'luna://tv.kroma.webos.service/network', payload: '{}' }]);
  });

  it('gives the id alone when the service has nothing to say', async () => {
    vi.stubGlobal('PalmServiceBridge', bus(JSON.stringify({ returnValue: false })));
    vi.stubGlobal('PalmSystem', { identifier: 'tv.kroma.webos' });

    await expect(webOsWakeHint()).resolves.toEqual({ appId: 'tv.kroma.webos' });
  });

  it('reads past an answer that is not JSON, or longer than any real one', async () => {
    vi.stubGlobal('PalmServiceBridge', bus('<html>'));
    await expect(webOsWakeHint()).resolves.toEqual({});

    vi.stubGlobal('PalmServiceBridge', bus(`{"address":"${'1'.repeat(2000)}","mac":"x"}`));
    await expect(webOsWakeHint()).resolves.toEqual({});
  });

  it('says nothing in a browser, where there is no bus', async () => {
    await expect(webOsWakeHint()).resolves.toEqual({});
  });
});
