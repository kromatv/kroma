import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdbDevice } from './androidtv/adb';
import { identify } from './identify';

const adb = vi.hoisted(() => vi.fn(async (): Promise<AdbDevice | null> => null));
vi.mock('./androidtv/adb', () => ({ adbDevice: adb }));

const answering = (routes: Record<string, unknown>) =>
  vi.stubGlobal('fetch', (url: string) => {
    const body = routes[url];
    if (body === undefined) return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(body)));
  });

const samsungInfo = (developerMode: string) => ({
  device: {
    name: '[TV] Salon',
    modelName: 'UE50AU7172',
    developerMode,
    developerIP: '192.168.1.20',
    OS: 'Tizen',
  },
});

const lgUpnp = {
  friendlyName: '[LG] webOS TV OLED55C16LA',
  manufacturer: 'LG Electronics',
  modelName: 'OLED55C16LA',
  modelNumber: 'OLED55C16LA',
};

const theFrame = {
  device: {
    name: '75&quot; The Frame',
    model: '24_PTM_FTV_T09',
    modelName: 'GQ75LS03DAUXZG',
    developerMode: '1',
    developerIP: '192.168.1.124',
    OS: 'Tizen',
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('identify', () => {
  it('names a Samsung set that answers its own API', async () => {
    answering({ 'http://192.168.1.31:8001/api/v2/': samsungInfo('1') });

    const tv = await identify('192.168.1.31', new Set([8001, 26101]));

    expect(tv).toMatchObject({
      platform: 'tizen',
      vendor: 'Samsung',
      name: '[TV] Salon',
      model: 'UE50AU7172',
      developerMode: 'on',
      sideloadable: true,
    });
  });

  it('tells a Samsung owner the code that turns developer mode on', async () => {
    answering({ 'http://192.168.1.31:8001/api/v2/': samsungInfo('0') });

    const tv = await identify('192.168.1.31', new Set([8001]));

    expect(tv?.developerMode).toBe('off');
    expect(tv?.note).toContain('1 2 3 4 5');
  });

  it('names an LG set by the key server it left open', async () => {
    answering({});

    const tv = await identify('192.168.1.32', new Set([9922, 3000]));

    expect(tv).toMatchObject({
      platform: 'webos',
      vendor: 'LG',
      developerMode: 'on',
      sideloadable: true,
    });
  });

  it('names an LG set that only spoke over UPnP, with its Dev Mode app asleep', async () => {
    answering({});

    const tv = await identify('192.168.1.32', new Set([3000]), lgUpnp);

    expect(tv).toMatchObject({
      platform: 'webos',
      vendor: 'LG',
      name: '[LG] webOS TV OLED55C16LA',
      model: 'OLED55C16LA',
      developerMode: 'off',
    });
  });

  it('names a Philips that runs Android TV with network debugging open', async () => {
    answering({
      'http://192.168.1.34:1925/6/system': {
        name: '55PUS7304/12',
        model: '55PUS7304/12',
        os_type: 'MSAF_2019_ANDROID_TV',
      },
    });

    const tv = await identify('192.168.1.34', new Set([1925, 5555]));

    expect(tv).toMatchObject({
      platform: 'androidtv',
      vendor: 'Philips',
      name: '55PUS7304/12',
      developerMode: 'on',
      sideloadable: true,
    });
  });

  it('falls back to a plain name for a Philips that answered with only a model', async () => {
    answering({ 'http://192.168.1.37:1925/6/system': { model: '50PUS6704/12' } });

    const tv = await identify('192.168.1.37', new Set([1925]));

    expect(tv?.name).toBe('Philips TV');
    expect(tv?.note).toContain('not Android');
  });

  it('carries no model for a Philips that answered with only a name', async () => {
    answering({
      'http://192.168.1.38:1925/6/system': { name: '43PUS7406/12', os_type: 'SAPHI' },
    });

    const tv = await identify('192.168.1.38', new Set([1925]));

    expect(tv?.model).toBe('');
  });

  it('tells a Philips Android owner where the debugging switch is', async () => {
    answering({
      'http://192.168.1.34:1925/6/system': {
        name: '55PUS7304/12',
        model: '55PUS7304/12',
        os_type: 'MSAF_2019_ANDROID_TV',
      },
    });

    const tv = await identify('192.168.1.34', new Set([1925]));

    expect(tv?.developerMode).toBe('off');
    expect(tv?.note).toContain('Developer options, Network debugging ON');
  });

  it('marks a Philips that runs Saphi as taking no sideloaded package', async () => {
    answering({
      'http://192.168.1.35:1925/6/system': {
        name: '50PUS6704/12',
        model: '50PUS6704/12',
        os_type: 'SAPHI',
      },
    });

    const tv = await identify('192.168.1.35', new Set([1925]));

    expect(tv?.sideloadable).toBe(false);
    expect(tv?.note).toContain('SAPHI');
  });

  it('takes an open debugging port alone as an Android TV', async () => {
    answering({});

    const tv = await identify('192.168.1.36', new Set([5555]));

    expect(tv).toMatchObject({
      platform: 'androidtv',
      vendor: 'Android TV',
      developerMode: 'on',
      sideloadable: true,
    });
  });

  it('reads back the name its owner typed, escaped as the set reports it', async () => {
    answering({ 'http://192.168.1.107:8001/api/v2/': theFrame });

    const tv = await identify('192.168.1.107', new Set([8001, 26101]));

    expect(tv?.name).toBe('75" The Frame');
    expect(tv?.note).toContain('192.168.1.124');
  });

  it('dates what a Samsung runs from the model year it opens with', async () => {
    answering({ 'http://192.168.1.107:8001/api/v2/': theFrame });

    const tv = await identify('192.168.1.107', new Set([8001, 26101]));

    expect(tv?.runtime).toEqual({
      name: 'Tizen',
      version: '8.0',
      engine: { name: 'Chromium', version: '108' },
      learned: 'derived',
    });
    expect(tv?.note).toBe('sdb open, host PC 192.168.1.124');
  });

  it('dates what an LG runs from the model UPnP named it by', async () => {
    answering({});

    const tv = await identify('192.168.1.32', new Set([3000]), lgUpnp);

    expect(tv?.runtime).toEqual({
      name: 'webOS',
      version: '6.0',
      engine: { name: 'Chromium', version: '79' },
      learned: 'derived',
    });
  });

  it('leaves a set no name dated without a runtime rather than guessing one', async () => {
    answering({});

    const tv = await identify('192.168.1.32', new Set([9922, 3000]));

    expect(tv?.runtime).toBeNull();
    expect(tv?.note).toBe('Dev Mode running, key server on 9922');
  });

  it('reads what an Android TV runs off the set when adb answers', async () => {
    answering({});
    adb.mockResolvedValueOnce({
      runtime: {
        name: 'Android',
        version: '12',
        engine: { name: 'WebView', version: '108' },
        learned: 'reported',
      },
      model: 'BRAVIA 4K VH2',
      vendor: 'Sony',
    });

    const tv = await identify('192.168.1.36', new Set([5555]));

    expect(tv).toMatchObject({
      vendor: 'Sony',
      model: 'BRAVIA 4K VH2',
      runtime: { version: '12', engine: { name: 'WebView', version: '108' } },
    });
    expect(tv?.note).toBe('network debugging open on 5555');
  });

  it('falls back to the year a Philips build tag carries when adb says nothing', async () => {
    answering({
      'http://192.168.1.34:1925/6/system': {
        name: '55PUS7304/12',
        model: '55PUS7304/12',
        os_type: 'MSAF_2019_ANDROID_TV',
      },
    });

    const tv = await identify('192.168.1.34', new Set([1925, 5555]));

    expect(tv?.runtime).toEqual({
      name: 'Android',
      version: '9',
      engine: null,
      learned: 'derived',
    });
  });

  it('passes over a Samsung soundbar, which answers the same API as a set', async () => {
    answering({
      'http://192.168.1.105:8001/api/v2/': {
        device: {
          name: 'Soundbar Salon',
          model: '25_MT8532_AISPK',
          modelName: '',
          ModelNumber: 'HW-QS700F',
          developerMode: '0',
          OS: 'Tizen',
        },
      },
    });

    expect(await identify('192.168.1.105', new Set([8001]))).toBeNull();
  });

  it('answers nothing for a host that is not a television', async () => {
    answering({});

    expect(await identify('192.168.1.37', new Set([22, 80]))).toBeNull();
  });
});
