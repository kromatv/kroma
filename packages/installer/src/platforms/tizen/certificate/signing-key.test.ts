import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { readPkcs12 } from './pkcs12';
import { pemCertificates, readSigningKey } from './signing-key';
import { selfSignedCertificate, toPem } from './x509';

vi.mock('./pkcs12', () => ({ readPkcs12: vi.fn() }));

const base = mkdtempSync(join(tmpdir(), 'kroma-signing-key-'));
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const authority = generateKeyPairSync('rsa', { modulusLength: 2048 });

const certificate = (commonName: string, publicKey = keys.publicKey) =>
  toPem(
    selfSignedCertificate({
      subject: { commonName },
      publicKey,
      privateKey: authority.privateKey,
      days: 1,
    }),
    'CERTIFICATE',
  );

function kept(name: string, chain: string): { key: string; chain: string } {
  const paths = { key: join(base, `${name}.key`), chain: join(base, `${name}.pem`) };
  writeFileSync(paths.key, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  writeFileSync(paths.chain, chain);
  return paths;
}

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('pemCertificates', () => {
  it('reads every certificate of a text, in the order it holds them', () => {
    const chain = pemCertificates(`${certificate('leaf')}${certificate('authority')}`);

    expect(chain.map((entry) => entry.subject)).toEqual(['CN=leaf', 'CN=authority']);
  });

  it('answers none for a text that holds no certificate', () => {
    expect(pemCertificates('not a certificate')).toEqual([]);
  });
});

describe('readSigningKey', () => {
  it('reads the key and its chain, leaf first, out of two PEM files', () => {
    const source = kept('pair', `${certificate('leaf')}${certificate('authority')}`);

    const { key, chain } = readSigningKey(source);

    expect(key.equals(keys.privateKey)).toBe(true);
    expect(chain.map((entry) => entry.subject)).toEqual(['CN=leaf', 'CN=authority']);
  });

  it('refuses a chain that does not start with the certificate of the key', () => {
    const source = kept('foreign', certificate('other', authority.publicKey));

    expect(() => readSigningKey(source)).toThrow(
      `${source.chain} does not start with the certificate of ${source.key}`,
    );
  });

  it('refuses a chain file that holds no certificate', () => {
    const source = kept('blank', '');

    expect(() => readSigningKey(source)).toThrow('does not start with the certificate of');
  });

  it('opens a PKCS#12 the way it always has', () => {
    const archive = { archive: '/certs/author.p12', password: 'secret' };

    readSigningKey(archive);

    expect(readPkcs12).toHaveBeenCalledWith(archive);
  });
});
