import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adbDevice } from './adb';
import { answers, type FakeAdbd, fakeAdbd, type Service } from './adb/fake-adbd.fixture';
import { type AdbKey, androidPublicKey, existingAdbKeys } from './adb/key';

vi.mock('./adb/key', async (original) => ({
  ...(await original<typeof import('./adb/key')>()),
  existingAdbKeys: vi.fn(),
}));

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const known: AdbKey = { privateKey, publicKey: androidPublicKey(privateKey, 'kroma@test') };

const props = [
  '[ro.build.version.release]: [12]',
  '[ro.product.model]: [SHIELD Android TV]',
  '[ro.product.manufacturer]: [NVIDIA]',
].join('\n');

const webview = 'Package [com.google.android.webview]\n    versionName=108.0.5359.128';

const services = (dumpsys = webview): Record<string, Service> => ({
  'shell:getprop': answers(props),
  'shell:dumpsys package com.google.android.webview': answers(dumpsys),
});

let fake: FakeAdbd | null = null;

beforeEach(() => {
  vi.mocked(existingAdbKeys).mockResolvedValue([known]);
});

afterEach(async () => {
  await fake?.close();
  fake = null;
});

describe('adbDevice', () => {
  it('reads the model and the maker off the set', async () => {
    fake = await fakeAdbd({ trusted: [privateKey], services: services() });

    const device = await adbDevice('127.0.0.1', fake.port);

    expect(device).toMatchObject({ model: 'SHIELD Android TV', vendor: 'NVIDIA' });
  });

  it('names the system WebView as the engine the set renders with', async () => {
    fake = await fakeAdbd({ trusted: [privateKey], services: services() });

    const device = await adbDevice('127.0.0.1', fake.port);

    expect(device?.runtime).toEqual({
      name: 'Android',
      version: '12',
      engine: { name: 'WebView', version: '108' },
      learned: 'reported',
    });
  });

  it('still answers when the set would not say which WebView it carries', async () => {
    fake = await fakeAdbd({ trusted: [privateKey], services: services('Unable to find package') });

    const device = await adbDevice('127.0.0.1', fake.port);

    expect(device?.runtime?.engine).toBeNull();
  });

  it('answers nothing, and connects to nothing, on a computer with no adb key yet', async () => {
    vi.mocked(existingAdbKeys).mockResolvedValue([]);
    fake = await fakeAdbd({ trusted: [privateKey], services: services() });

    expect(await adbDevice('127.0.0.1', fake.port)).toBeNull();
    expect(fake.opened).toEqual([]);
  });

  it('answers nothing, and shows no prompt on the TV, when the TV trusts none of the keys', async () => {
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    fake = await fakeAdbd({ trusted: [stranger], services: services() });

    expect(await adbDevice('127.0.0.1', fake.port)).toBeNull();
    expect(fake.prompts).toEqual([]);
  });

  it('answers nothing rather than failing the scan when the set refuses the connection', async () => {
    fake = await fakeAdbd({});
    const port = fake.port;
    await fake.close();
    fake = null;

    expect(await adbDevice('127.0.0.1', port)).toBeNull();
  });
});
