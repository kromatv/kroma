import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ipkAppId } from './ipk';
import { controlArchive, ipkBytes } from './ipk.fixture';

let scratch: string;

const written = async (bytes: Buffer) => {
  const path = join(scratch, 'KROMA-webos-0.1.40.ipk');
  await writeFile(path, bytes);
  return path;
};

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'kroma-ipk-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('ipkAppId', () => {
  it('reads the native app id from the control file', async () => {
    expect(await ipkAppId(await written(ipkBytes()))).toBe('tv.kroma.app');
  });

  it('reads the web app id from a package ares-package wrote', async () => {
    const path = await written(ipkBytes({ control: 'Package: tv.kroma.webos\nVersion: 0.1.33\n' }));

    expect(await ipkAppId(path)).toBe('tv.kroma.webos');
  });

  it('finds a control file named without the leading ./', async () => {
    expect(await ipkAppId(await written(ipkBytes({ controlName: 'control' })))).toBe(
      'tv.kroma.app',
    );
  });

  it('steps over a member of odd length to the control archive', async () => {
    const members: [string, Uint8Array][] = [
      ['debian-binary', Buffer.from('2.0')],
      ['control.tar.gz', controlArchive()],
    ];

    expect(await ipkAppId(await written(ipkBytes({ members })))).toBe('tv.kroma.app');
  });

  it('refuses a control archive with no control file in it', async () => {
    const members: [string, Uint8Array][] = [
      ['control.tar.gz', controlArchive(undefined, './postinst')],
    ];

    await expect(ipkAppId(await written(ipkBytes({ members })))).rejects.toThrow(
      "the .ipk's control.tar.gz holds no control",
    );
  });

  it('refuses a file that is not an .ipk', async () => {
    await expect(ipkAppId(await written(Buffer.from('PK\u0003\u0004')))).rejects.toThrow(
      'not an .ipk',
    );
  });

  it('refuses a package with no control archive', async () => {
    const members: [string, Uint8Array][] = [['debian-binary', Buffer.from('2.0\n')]];

    await expect(ipkAppId(await written(ipkBytes({ members })))).rejects.toThrow(
      'the .ipk holds no control.tar.gz',
    );
  });

  it('refuses a control file that names no package', async () => {
    const path = await written(ipkBytes({ control: 'Version: 0.1.40\n' }));

    await expect(ipkAppId(path)).rejects.toThrow('names no usable app id in its control file');
  });

  it('refuses an id that could break out of the command the set runs', async () => {
    const path = await written(ipkBytes({ control: "Package: tv.kroma.app';reboot\n" }));

    await expect(ipkAppId(path)).rejects.toThrow('names no usable app id in its control file');
  });

  it('refuses a control archive that says it unpacks past a megabyte', async () => {
    const control = Buffer.from(gzipSync(Buffer.alloc(16)));
    control.writeUInt32LE(2 * 1024 * 1024, control.length - 4);
    const members: [string, Uint8Array][] = [['control.tar.gz', control]];

    await expect(ipkAppId(await written(ipkBytes({ members })))).rejects.toThrow(
      "the .ipk's control.tar.gz is too large",
    );
  });
});
