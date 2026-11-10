import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LISTED_CERTIFICATE, LISTED_DUIDS } from './listed.fixture';
import { duidsIn, keptDuids, keptUntil, readSamsungProfile, samsungFiles } from './profile';

const base = mkdtempSync(join(tmpdir(), 'kroma-samsung-profile-'));

function kept(name: string, files: readonly string[]): string {
  const directory = join(base, name);
  mkdirSync(directory, { recursive: true });
  for (const file of files) writeFileSync(join(directory, file), LISTED_CERTIFICATE);
  return directory;
}

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('readSamsungProfile', () => {
  it('answers both halves once Samsung has issued both', () => {
    const directory = kept('whole', [
      'author.key',
      'author.pem',
      'distributor.key',
      'distributor.pem',
    ]);

    expect(readSamsungProfile(directory)).toEqual({
      name: 'samsung',
      author: { key: join(directory, 'author.key'), chain: join(directory, 'author.pem') },
      distributor: {
        key: join(directory, 'distributor.key'),
        chain: join(directory, 'distributor.pem'),
      },
    });
  });

  it('answers nothing while a half is missing', () => {
    const directory = kept('half', ['author.key', 'author.pem']);

    expect(readSamsungProfile(directory)).toBeNull();
  });
});

describe('duidsIn', () => {
  it('reads every set a distributor certificate lists', () => {
    const names =
      'URI:URN:tizen:packageid=, URI:URN:tizen:deviceid=1900A2C4D6E8, URI:URN:tizen:deviceid=AB12CD34EF56';

    expect(duidsIn(names)).toEqual(['1900A2C4D6E8', 'AB12CD34EF56']);
  });

  it('answers none for a certificate that lists no alternative name', () => {
    expect(duidsIn(undefined)).toEqual([]);
  });
});

describe('keptDuids', () => {
  it('reads the sets off the distributor certificate that is kept', () => {
    const directory = kept('listed', ['distributor.pem']);

    expect(keptDuids(directory)).toEqual(LISTED_DUIDS);
  });

  it('answers none before any distributor certificate is kept', () => {
    expect(keptDuids(join(base, 'nothing-yet'))).toEqual([]);
  });

  it('answers none for a file that holds no certificate', () => {
    const directory = join(base, 'emptied');
    mkdirSync(directory, { recursive: true });
    writeFileSync(samsungFiles(directory).distributorChain, '');

    expect(keptDuids(directory)).toEqual([]);
  });
});

describe('keptUntil', () => {
  it('answers when the kept certificate stops being valid', () => {
    const directory = kept('dated', ['author.pem']);

    expect(keptUntil(samsungFiles(directory).authorChain)?.getUTCFullYear()).toBe(2126);
  });

  it('answers nothing for a chain that is not kept', () => {
    expect(keptUntil(join(base, 'nothing-yet', 'author.pem'))).toBeNull();
  });

  it('answers nothing for a file that holds no certificate', () => {
    const directory = join(base, 'blank');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'author.pem'), '');

    expect(keptUntil(join(directory, 'author.pem'))).toBeNull();
  });
});
