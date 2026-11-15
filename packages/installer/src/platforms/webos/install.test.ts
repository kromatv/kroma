import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InstallContext } from '../platform';
import {
  devModeKeys,
  type FakeTv,
  type FakeTvOptions,
  PASSPHRASE,
  startFakeTv,
} from './devmode/fake-tv.fixture';
import { keptKeyPath } from './devmode/key';
import { installWebos } from './install';
import { ipkBytes } from './ipk.fixture';

const IPK = 'KROMA-webos-0.1.40.ipk';
const REMOTE = `/media/developer/temp/${IPK}`;
const PACKAGE = ipkBytes({ payload: randomBytes(150_000) });

let scratch: string;
let ipk: string;
let keys: string;
let tv: FakeTv | null = null;
let logged: string[];

const boot = async (options: FakeTvOptions = {}) => {
  tv = await startFakeTv(options);
  return tv;
};

const context = (
  set: FakeTv,
  options: InstallContext['options'] = { passphrase: PASSPHRASE },
  launch = true,
): InstallContext => ({
  tv: {
    host: set.host,
    platform: 'webos',
    vendor: 'LG',
    name: 'Chambre',
    model: 'OLED55C1',
    developerMode: 'on',
    sideloadable: true,
    note: '',
    runtime: null,
  },
  artifact: ipk,
  log: (line) => logged.push(line),
  launch,
  options,
});

const install = (set: FakeTv, options?: InstallContext['options'], launch?: boolean) =>
  installWebos(context(set, options, launch), {
    directory: keys,
    keyServerPort: set.keyServerPort,
    sshPort: set.sshPort,
  });

const luna = (set: FakeTv) => set.commands.filter((command) => command.includes('luna-send'));

beforeAll(() => {
  devModeKeys();
});

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'kroma-webos-'));
  ipk = join(scratch, IPK);
  keys = join(scratch, 'keys');
  logged = [];
  await writeFile(ipk, PACKAGE);
});

afterEach(async () => {
  await tv?.close();
  tv = null;
  await rm(scratch, { recursive: true, force: true });
});

describe('installWebos', () => {
  it('logs in as prisoner and puts the package in the developer temp folder', async () => {
    const set = await boot();

    await install(set);

    expect(set.users).toContain('prisoner');
    expect(set.commands[0]).toBe(
      '/usr/bin/test -d /media/developer/temp || /bin/mkdir -p /media/developer/temp',
    );
    expect(set.received.get(REMOTE)?.byteLength).toBe(PACKAGE.byteLength);
  });

  it('asks the install service for the package as ares-install does', async () => {
    const set = await boot();

    await install(set);

    expect(luna(set)[0]).toBe(
      `/usr/bin/luna-send-pub -i luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"${REMOTE}","subscribe":true}'`,
    );
    expect(logged).toContain('installing');
    expect(logged).toContain('installed');
  });

  it('removes the package from the set once it is installed', async () => {
    const set = await boot();

    await install(set);

    expect(set.commands).toContain(`/bin/rm -f "${REMOTE}"`);
    expect(set.files.has(REMOTE)).toBe(false);
  });

  it('starts the app on display 0 where the set runs no session manager', async () => {
    const set = await boot();

    await install(set);

    expect(luna(set).slice(1)).toEqual([
      `/usr/bin/luna-send-pub -n 1 luna://com.webos.service.sessionmanager//getSessionList '{"subscribe":false}'`,
      `/usr/bin/luna-send-pub -n 1 luna://com.webos.applicationManager//launch '{"id":"tv.kroma.app","subscribe":false,"params":{"displayAffinity":0}}'`,
    ]);
  });

  it('starts the web app by the id its own package names', async () => {
    await writeFile(ipk, ipkBytes({ control: 'Package: tv.kroma.webos\nVersion: 0.1.33\n' }));
    const set = await boot();

    await install(set);

    expect(luna(set).at(-1)).toContain('"id":"tv.kroma.webos"');
  });

  it('refuses a package it cannot read before it reaches the set', async () => {
    await writeFile(ipk, randomBytes(1_000));
    const set = await boot();

    await expect(install(set)).rejects.toThrow('not an .ipk');
    expect(set.commands).toEqual([]);
  });

  it('starts the app in the session of display 0 where the set has one', async () => {
    const sessionList = [{ sessionId: 'host-1', deviceSetInfo: { displayId: 0 } }];
    const set = await boot({ sessionReply: { returnValue: true, sessionList } });

    await install(set);

    expect(luna(set).at(-1)).toBe(
      `/usr/bin/luna-send-pub -n 1 -c host-1 luna://com.webos.applicationManager//launch '{"id":"tv.kroma.app","subscribe":false,"params":{}}'`,
    );
  });

  it('leaves the app alone when it was told to install without starting it', async () => {
    const set = await boot();

    await install(set, { passphrase: PASSPHRASE }, false);

    expect(luna(set)).toHaveLength(1);
  });

  it('keeps the opened key for its owner alone, and needs no passphrase the next time', async () => {
    const set = await boot();
    await install(set);

    await install(set, {});

    expect((await stat(keptKeyPath(set.host, keys))).mode & 0o777).toBe(0o600);
    expect((await stat(keys)).mode & 0o777).toBe(0o700);
    expect(luna(set).filter((command) => command.includes('install'))).toHaveLength(2);
  });

  it('streams the package through cat on a set that serves no SFTP', async () => {
    const set = await boot({ sftp: false });

    await install(set);

    expect(set.commands).toContain(`/bin/cat > "${REMOTE}"`);
    expect(set.received.get(REMOTE)?.byteLength).toBe(PACKAGE.byteLength);
  });

  it('says why the install service refused the package, and still removes it', async () => {
    const replies = [{ details: { state: 'FAILED', reason: 'Not enough space' } }];
    const set = await boot({ installReplies: replies });

    await expect(install(set)).rejects.toThrow('the TV refused the package: Not enough space');

    expect(set.files.has(REMOTE)).toBe(false);
  });

  it('quotes the error text of a call the service refused outright', async () => {
    const replies = [{ returnValue: false, errorText: 'Denied method call' }];
    const set = await boot({ installReplies: replies });

    await expect(install(set)).rejects.toThrow(
      'com.webos.appInstallService refused: Denied method call',
    );
  });

  it('refuses an install the service never gave a verdict on', async () => {
    const set = await boot({
      installReplies: [{ details: { state: 'installing' } }],
      installExits: true,
    });

    await expect(install(set)).rejects.toThrow('com.webos.appInstallService ended with no answer');
  });

  it('stops when the set cannot make its developer temp folder', async () => {
    const set = await boot({ mkdirCode: 1 });

    await expect(install(set)).rejects.toThrow('exited with 1');
  });

  it('says the set did not start the app when the launch answers anything but success', async () => {
    const set = await boot({ launchReply: { processId: '1001' } });

    await expect(install(set)).rejects.toThrow('the TV did not start tv.kroma.app');
  });

  it('tells the user to give the passphrase again when the set refuses the key', async () => {
    const set = await boot({ acceptKey: false });

    await expect(install(set)).rejects.toThrow(
      "refused this computer's key: turn Key Server on in the Dev Mode app",
    );
  });
});
