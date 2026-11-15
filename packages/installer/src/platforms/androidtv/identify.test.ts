import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MdnsService } from '../../discovery/mdns';
import type { AdbDevice } from './adb';
import { ANDROID_SERVICES, identifyAndroidTv } from './identify';

const adb = vi.hoisted(() => vi.fn(async (): Promise<AdbDevice | null> => null));
vi.mock('./adb', () => ({ adbDevice: adb }));

const HOST = '192.168.1.78';
const connect: MdnsService = {
  host: HOST,
  type: '_adb-tls-connect._tcp',
  instance: 'adb-2808105GN-cT0TLZ',
  port: 35221,
};
const cast: MdnsService = {
  host: HOST,
  type: '_googlecast._tcp',
  instance: 'Chromecast-HD-0f1e',
  port: 8009,
};
const dial = {
  friendlyName: 'Salon TV',
  manufacturer: 'Google Inc.',
  modelName: 'Chromecast HD',
  modelNumber: '',
};
const chromecast: AdbDevice = {
  runtime: {
    name: 'Android',
    version: '14',
    engine: { name: 'WebView', version: '131' },
    learned: 'reported',
  },
  model: 'Chromecast HD',
  vendor: 'Google',
  tv: true,
};

const philips = (routes: Record<string, unknown>) =>
  vi.stubGlobal('fetch', (url: string) => {
    const body = routes[url];
    if (body === undefined) return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(body)));
  });

afterEach(() => {
  vi.unstubAllGlobals();
  adb.mockReset();
});

describe('identifyAndroidTv, on Wireless debugging', () => {
  it('browses for the adb service of Wireless debugging, and for what tells a TV from a phone', () => {
    expect(ANDROID_SERVICES).toEqual(['_adb-tls-connect._tcp', '_googlecast._tcp']);
  });

  it('reads a paired set over the port it advertises, and names it ready', async () => {
    adb.mockResolvedValue(chromecast);

    const tv = await identifyAndroidTv(HOST, new Set(), dial, [connect, cast]);

    expect(adb).toHaveBeenCalledWith(HOST, 35221);
    expect(tv).toMatchObject({
      platform: 'androidtv',
      vendor: 'Google',
      name: 'Salon TV',
      model: 'Chromecast HD',
      developerMode: 'on',
      sideloadable: true,
      note: 'Wireless debugging on, paired with this computer',
      runtime: { version: '14' },
    });
  });

  it('lists a set that casts and was never paired, as one that asks for a code', async () => {
    const tv = await identifyAndroidTv(HOST, new Set(), undefined, [connect, cast]);

    expect(tv).toMatchObject({
      vendor: 'Android TV',
      name: 'Android TV',
      developerMode: 'on',
      note: 'Wireless debugging on, asks for a pairing code',
      runtime: null,
    });
  });

  it('names a set that was never paired from what it said over UPnP', async () => {
    const tv = await identifyAndroidTv(HOST, new Set(), dial, [connect]);

    expect(tv).toMatchObject({ vendor: 'Google Inc.', name: 'Salon TV', model: 'Chromecast HD' });
  });

  it('passes over a phone in Wireless debugging, which neither casts nor answers UPnP', async () => {
    expect(await identifyAndroidTv(HOST, new Set(), undefined, [connect])).toBeNull();
  });

  it('passes over a paired phone, which does not say it is a TV either', async () => {
    adb.mockResolvedValue({ ...chromecast, model: 'Pixel 9', tv: false });

    expect(await identifyAndroidTv(HOST, new Set(), undefined, [connect])).toBeNull();
  });

  it('takes the word of a paired set that says it is a TV, with nothing else to go by', async () => {
    adb.mockResolvedValue(chromecast);

    const tv = await identifyAndroidTv(HOST, new Set(), undefined, [connect]);

    expect(tv?.name).toBe('Chromecast HD');
  });

  it('prefers port 5555 on a set that holds both open', async () => {
    const tv = await identifyAndroidTv(HOST, new Set([5555]), undefined, [connect]);

    expect(adb).toHaveBeenCalledWith(HOST, 5555);
    expect(tv?.note).toBe('network debugging open on 5555');
  });

  it('answers nothing for a host that only casts', async () => {
    expect(await identifyAndroidTv(HOST, new Set(), dial, [cast])).toBeNull();
  });

  it('reads a Philips on Wireless debugging over the port it advertises', async () => {
    philips({
      [`http://${HOST}:1925/6/system`]: { name: 'Salon', os_type: 'MSAF_2023_ANDROID_TV' },
    });

    const tv = await identifyAndroidTv(HOST, new Set([1925]), undefined, [connect]);

    expect(adb).toHaveBeenCalledWith(HOST, 35221);
    expect(tv).toMatchObject({
      vendor: 'Philips',
      developerMode: 'on',
      note: 'Android TV, Wireless debugging on',
    });
  });
});
