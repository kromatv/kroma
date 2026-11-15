import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../shared/television';
import type { InstallContext } from '../platform';
import { AdbConnection } from './adb/connection';
import {
  answers,
  type FakeAdbd,
  fakeAdbd,
  type FakeAdbdOptions,
  takes,
} from './adb/fake-adbd.fixture';
import { type AdbKey, adbKeys, androidPublicKey } from './adb/key';
import { adbEndpoint } from './endpoint';
import { installAndroid, installFailure } from './install';
import { pairSet } from './pair-set';

vi.mock('./adb/key', async (original) => ({
  ...(await original<typeof import('./adb/key')>()),
  adbKeys: vi.fn(),
}));
vi.mock('./app-id', () => ({ androidAppId: () => 'tv.kroma.tv' }));
vi.mock('./endpoint', () => ({ adbEndpoint: vi.fn() }));
vi.mock('./pair-set', async (original) => ({
  ...(await original<typeof import('./pair-set')>()),
  pairSet: vi.fn(),
}));

const base = mkdtempSync(join(tmpdir(), 'kroma-android-install-'));
const artifact = join(base, 'KROMA.apk');
writeFileSync(artifact, Buffer.alloc(10_000, 1));

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const ours: AdbKey = { privateKey, publicKey: androidPublicKey(privateKey, 'kroma@test') };
const LAUNCH = 'shell:monkey -p tv.kroma.tv -c android.intent.category.LEANBACK_LAUNCHER 1';
const INSTALL = "exec:cmd package 'install' '-r' -S 10000";

const shield: Television = {
  host: '192.168.1.34',
  platform: 'androidtv',
  vendor: 'Nvidia',
  name: 'Shield',
  model: 'SHIELD Android TV',
  developerMode: 'on',
  sideloadable: true,
  note: 'network debugging open on 5555',
  runtime: null,
};

let fake: FakeAdbd | null = null;
const lines: string[] = [];
const context = (overrides: Partial<InstallContext> = {}): InstallContext => ({
  tv: shield,
  artifact,
  log: (line) => lines.push(line),
  launch: true,
  options: {},
  ...overrides,
});

async function tvAnswering(options: FakeAdbdOptions, promptTimeoutMs?: number): Promise<FakeAdbd> {
  fake = await fakeAdbd({ features: ['cmd'], ...options });
  const port = fake.port;
  const open = AdbConnection.open.bind(AdbConnection);
  vi.spyOn(AdbConnection, 'open').mockImplementation((_host, _port, handshake) =>
    open('127.0.0.1', port, { ...handshake, ...(promptTimeoutMs ? { promptTimeoutMs } : {}) }),
  );
  return fake;
}

beforeEach(() => {
  lines.length = 0;
  vi.mocked(adbKeys).mockResolvedValue([ours]);
  vi.mocked(adbEndpoint).mockResolvedValue({ port: 5555, wireless: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fake?.close();
  fake = null;
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('installAndroid', () => {
  it('installs over adb spoken by the tool itself, then starts the app from the TV launcher', async () => {
    const tv = await tvAnswering({
      trusted: [privateKey],
      services: { [INSTALL]: takes(10_000, 'Success\n'), [LAUNCH]: answers('') },
    });

    await installAndroid(context());

    expect(tv.opened).toEqual([INSTALL, LAUNCH]);
    expect(lines.at(-1)).toBe('sending KROMA.apk, 100%');
  });

  it('leaves the app alone when the install was told not to launch', async () => {
    const tv = await tvAnswering({ services: { [INSTALL]: takes(10_000, 'Success\n') } });

    await installAndroid(context({ launch: false }));

    expect(tv.opened).toEqual([INSTALL]);
  });

  it('asks the owner to allow this computer on the TV, and goes on once they do', async () => {
    const tv = await tvAnswering({
      trusted: [],
      acceptPrompt: true,
      services: { [INSTALL]: takes(10_000, 'Success\n') },
    });

    await installAndroid(context({ launch: false }));

    expect(lines[0]).toBe(
      'the TV asks to allow this computer: accept the prompt on the TV, and tick Always allow',
    );
    expect(tv.prompts).toHaveLength(1);
  });

  it('says to accept the prompt and run it again when nobody allowed this computer', async () => {
    await tvAnswering({ trusted: [] }, 50);

    await expect(installAndroid(context())).rejects.toThrow(
      'nobody allowed this computer on the TV within two minutes: accept the prompt on screen, then run this again',
    );
  });

  it('says to turn Network debugging on when the TV refuses adb', async () => {
    const tv = await tvAnswering({});
    await tv.close();
    fake = null;

    await expect(installAndroid(context())).rejects.toThrow(
      'the TV refused adb: turn Network debugging on in Developer options',
    );
  });

  it('says what to turn on when the TV answers adb nowhere', async () => {
    vi.mocked(adbEndpoint).mockResolvedValue(null);

    await expect(installAndroid(context())).rejects.toThrow(
      'the TV does not answer adb: turn on Wireless debugging, or Network debugging, in Developer options',
    );
  });

  it('installs over TLS on a TV on Wireless debugging that was paired with this computer', async () => {
    const tv = await tvAnswering({
      tls: true,
      trusted: [privateKey],
      services: { [INSTALL]: takes(10_000, 'Success\n'), [LAUNCH]: answers('') },
    });

    await installAndroid(context());

    expect(tv.opened).toEqual([INSTALL, LAUNCH]);
    expect(pairSet).not.toHaveBeenCalled();
  });

  it('asks for the pairing code of a TV on Wireless debugging that was never paired', async () => {
    await tvAnswering({ tls: true, trusted: [] });

    await expect(installAndroid(context())).rejects.toThrow(
      'the TV has not been paired with this computer: on the TV, open Developer options, Wireless debugging, Pair device with pairing code, then give the code with --pairing-code',
    );
    expect(pairSet).not.toHaveBeenCalled();
  });

  it('pairs with the code it was given, then installs', async () => {
    const trusted: (typeof privateKey)[] = [];
    const tv = await tvAnswering({
      tls: true,
      trusted,
      services: { [INSTALL]: takes(10_000, 'Success\n') },
    });
    vi.mocked(pairSet).mockImplementation(async () => {
      trusted.push(privateKey);
    });

    await installAndroid(context({ launch: false, options: { 'pairing-code': '701 965' } }));

    expect(pairSet).toHaveBeenCalledWith(shield.host, '701965');
    expect(tv.opened).toEqual([INSTALL]);
    expect(lines[0]).toBe('pairing this computer with the TV');
  });

  it('refuses a pairing code that is not six digits before sending it', async () => {
    await tvAnswering({ tls: true, trusted: [] });

    const installing = installAndroid(context({ options: { 'pairing-code': '7019' } }));

    await expect(installing).rejects.toThrow('a pairing code is the six digits the TV shows');
    expect(pairSet).not.toHaveBeenCalled();
  });

  it('says so when the TV still knows no key after the pairing', async () => {
    await tvAnswering({ tls: true, trusted: [] });

    const installing = installAndroid(context({ options: { 'pairing-code': '701965' } }));

    await expect(installing).rejects.toThrow('the TV has not been paired with this computer');
  });

  it('passes on why the pairing failed', async () => {
    await tvAnswering({ tls: true, trusted: [] });
    vi.mocked(pairSet).mockRejectedValue(new Error('the TV refused that pairing code'));

    const installing = installAndroid(context({ options: { 'pairing-code': '701965' } }));

    await expect(installing).rejects.toThrow('the TV refused that pairing code');
  });

  it('leaves the pairing code alone on a TV that already lets this computer in', async () => {
    await tvAnswering({ services: { [INSTALL]: takes(10_000, 'Success\n') } });

    await installAndroid(context({ launch: false, options: { 'pairing-code': '701965' } }));

    expect(pairSet).not.toHaveBeenCalled();
  });

  it('answers the advice for the failure the package manager reported', async () => {
    await tvAnswering({
      services: { [INSTALL]: takes(10_000, 'Failure [INSTALL_FAILED_VERSION_DOWNGRADE]\n') },
    });

    await expect(installAndroid(context())).rejects.toThrow('the TV already has a newer build');
  });
});

describe('installFailure', () => {
  it('tells the owner to remove a KROMA that was signed with another key', () => {
    expect(installFailure('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package]')).toBe(
      'a KROMA signed with another key is already there: uninstall it on the TV (Settings, Apps, KROMA), then install again',
    );
  });

  it('quotes what the TV said when the failure is one it has no advice for', () => {
    expect(installFailure('Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]\n')).toBe(
      'the TV refused the install: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]',
    );
  });

  it('says only that the TV refused when it said nothing', () => {
    expect(installFailure('')).toBe('the TV refused the install');
  });
});
