import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readPkcs12 } from './pkcs12';
import { writeArchive } from './pkcs12.fixture';

const directory = mkdtempSync(join(tmpdir(), 'kroma-pkcs12-'));
const issued = writeArchive(directory, 'leaf');

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('readPkcs12', () => {
  it('returns the chain leaf first, then the authority that issued it', () => {
    const { chain } = readPkcs12(issued);

    expect(chain.map((certificate) => certificate.subject)).toEqual([
      expect.stringContaining('CN=leaf'),
      expect.stringContaining('CN=leaf authority'),
    ]);
  });

  it('returns the key the leaf certificate belongs to', () => {
    const { chain, key } = readPkcs12(issued);

    expect(chain[0]?.checkPrivateKey(key)).toBe(true);
  });

  it('names the archive the password did not open', () => {
    expect(() => readPkcs12({ ...issued, password: 'wrong' })).toThrow(issued.archive);
  });
});
