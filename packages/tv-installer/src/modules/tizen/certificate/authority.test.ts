import { spawnSync } from 'node:child_process';
import { createPrivateKey, randomInt, X509Certificate } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { nodeSpawn } from '../../../run.fixture';
import { type AuthorRequest, createAuthorCertificate } from './authority';
import { OPENSSL } from './openssl';
import { randomPassword } from './password';
import { readPkcs12 } from './pkcs12';

vi.stubGlobal('Bun', { spawn: nodeSpawn });

const DAY_MS = 86_400_000;
const bases: string[] = [];

function request(over: Partial<AuthorRequest> = {}): AuthorRequest {
  const base = mkdtempSync(join(tmpdir(), 'kroma-authority-'));
  bases.push(base);
  const name = `kroma-${randomInt(1000, 9999)}`;
  return {
    directory: join(base, 'certificates', name),
    alias: name,
    password: randomPassword(),
    subject: { commonName: name.toUpperCase(), organization: 'KROMA', country: 'ch' },
    ...over,
  };
}

const lifetimeDays = (certificate: X509Certificate) =>
  (Date.parse(certificate.validTo) - Date.parse(certificate.validFrom)) / DAY_MS;

const asked = request();
const author = await createAuthorCertificate(asked);
const signed = new X509Certificate(await readFile(author.certificate));

afterEach(() => {
  vi.doUnmock('./openssl');
  vi.resetModules();
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

describe('createAuthorCertificate', () => {
  it('answers where each of the files it wrote landed', () => {
    expect(author).toEqual({
      directory: asked.directory,
      certificate: join(asked.directory, 'author.crt'),
      key: join(asked.directory, 'author.key'),
      archive: join(asked.directory, 'author.p12'),
      passwordFile: join(asked.directory, 'author.pwd'),
      password: asked.password,
    });
  });

  it('writes a certificate carrying the subject it was asked to sign', () => {
    expect(signed.subject).toContain(`CN=${asked.subject.commonName}`);
    expect(signed.subject).toContain('C=CH');
  });

  it('signs the certificate with the key it wrote beside it', async () => {
    const key = createPrivateKey(await readFile(author.key, 'utf8'));

    expect(signed.checkPrivateKey(key)).toBe(true);
  });

  it('signs the certificate with itself, so nothing above it has to be trusted', () => {
    expect(signed.issuer).toBe(signed.subject);
    expect(signed.verify(signed.publicKey)).toBe(true);
  });

  it('keeps the certificate good for five years when no lifetime was named', () => {
    expect(lifetimeDays(signed)).toBe(1825);
  });

  it('honours a lifetime it was given', async () => {
    const short = await createAuthorCertificate(request({ days: 30 }));

    expect(lifetimeDays(new X509Certificate(await readFile(short.certificate)))).toBe(30);
  });

  it('keeps the key and the password readable only by the account that made them', () => {
    expect(statSync(author.key).mode & 0o777).toBe(0o600);
    expect(statSync(author.passwordFile).mode & 0o777).toBe(0o600);
  });

  it('packs an archive that opens under the password it wrote beside it', async () => {
    const written = await readFile(author.passwordFile, 'utf8');

    const { chain, key } = readPkcs12({ archive: author.archive, password: written });

    expect(chain[0]?.checkPrivateKey(key)).toBe(true);
    expect(chain[0]?.subject).toBe(signed.subject);
  });

  it('files the key in the archive under the alias the Tizen tools look it up by', () => {
    const dumped = spawnSync(
      OPENSSL,
      ['pkcs12', '-in', author.archive, '-nokeys', '-info', '-passin', 'stdin'],
      { input: `${asked.password}\n`, encoding: 'utf8' },
    );

    expect(dumped.stdout + dumped.stderr).toContain(`friendlyName: ${asked.alias}`);
  });

  it('says openssl is needed when this machine has none', async () => {
    vi.resetModules();
    vi.doMock('./openssl', () => ({ OPENSSL: join(tmpdir(), 'kroma-openssl-that-is-not-here') }));

    const { createAuthorCertificate: withoutOpenssl } = await import('./authority');

    await expect(withoutOpenssl(request())).rejects.toThrow('openssl is needed');
  });
});
