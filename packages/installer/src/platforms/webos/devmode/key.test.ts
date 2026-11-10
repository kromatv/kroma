import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  devModeKeys,
  type FakeTv,
  type FakeTvOptions,
  PASSPHRASE,
  startFakeTv,
} from './fake-tv.fixture';
import { devModeKey, keptKeyPath } from './key';

let directory: string;
let tv: FakeTv | null = null;

const fetchFrom = async (options: FakeTvOptions, passphrase = PASSPHRASE) => {
  tv = await startFakeTv(options);
  return devModeKey(tv.host, passphrase, { directory, keyServerPort: tv.keyServerPort });
};

beforeAll(() => {
  devModeKeys();
});

beforeEach(async () => {
  directory = join(await mkdtemp(join(tmpdir(), 'kroma-keys-')), 'webos');
});

afterEach(async () => {
  await tv?.close();
  tv = null;
  await rm(join(directory, '..'), { recursive: true, force: true });
});

describe('keptKeyPath', () => {
  it('names the file after the address of the set', () => {
    expect(keptKeyPath('192.168.1.44', '/keys')).toBe('/keys/192.168.1.44.pem');
  });

  it('keeps an IPv6 address to characters every file system takes', () => {
    expect(keptKeyPath('fe80::1%en0', '/keys')).toBe('/keys/fe80__1_en0.pem');
  });
});

describe('devModeKey', () => {
  it('opens the key the key server hands out with the passphrase, and keeps it opened', async () => {
    const key = await fetchFrom({});

    expect(key).toContain('BEGIN RSA PRIVATE KEY');
    expect(key).not.toContain('ENCRYPTED');
    expect(await readFile(keptKeyPath('127.0.0.1', directory), 'utf8')).toBe(key);
  });

  it('reads the kept key back when no passphrase is given', async () => {
    const fetched = await fetchFrom({});

    const kept = await devModeKey('127.0.0.1', undefined, { directory, keyServerPort: 1 });

    expect(kept).toBe(fetched);
  });

  it('refuses a passphrase that does not open the key, and keeps nothing', async () => {
    await expect(fetchFrom({}, 'WRONG1')).rejects.toThrow(
      'the key of 127.0.0.1 did not open with that passphrase',
    );

    expect(existsSync(keptKeyPath('127.0.0.1', directory))).toBe(false);
  });

  it('refuses an answer that is not a key at all', async () => {
    await expect(fetchFrom({ keyServer: 'garbage' })).rejects.toThrow('did not open');
  });

  it('tells the user to turn Key Server on when nothing answers on its port', async () => {
    await expect(fetchFrom({ keyServer: 'off' })).rejects.toThrow(
      'open the Dev Mode app and turn Key Server on',
    );
  });

  it('tells the user the same when the key server has no key to give', async () => {
    await expect(fetchFrom({ keyServer: 'refusing' })).rejects.toThrow('did not answer');
  });

  it('asks for the passphrase when this computer holds no key for the set', async () => {
    await expect(fetchFrom({}, '')).rejects.toThrow('this computer holds no key for 127.0.0.1 yet');
  });

  it('takes a kept file that is not a key for no key at all', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(keptKeyPath('127.0.0.1', directory), 'scribbled over');

    await expect(fetchFrom({}, '')).rejects.toThrow('holds no key');
  });

  it('takes a kept file larger than any key for no key at all', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(keptKeyPath('127.0.0.1', directory), 'x'.repeat(20_000));

    await expect(fetchFrom({}, '')).rejects.toThrow('holds no key');
  });
});
