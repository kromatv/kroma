import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selfSignedCertificate, toPem } from '../certificate/x509';
import { VD_AUTHOR_CA, VD_PUBLIC_CA } from './authorities';
import { issueAuthor, issueDistributor } from './issuer';
import { keptDuids } from './profile';
import { type KeyPair, requestCertificates } from './request';

vi.mock('./issuer', () => ({ issueAuthor: vi.fn(), issueDistributor: vi.fn() }));
vi.mock('./profile', async (original) => ({
  ...(await original<typeof import('./profile')>()),
  keptDuids: vi.fn(() => []),
}));

const base = mkdtempSync(join(tmpdir(), 'kroma-samsung-request-'));
const samsung = generateKeyPairSync('rsa', { modulusLength: 2048 });
const access = { accessToken: 'token-123', userId: 'user-456', email: 'owner@example.com' };

const issuedTo = (keys: KeyPair, days = 365) =>
  toPem(
    selfSignedCertificate({
      subject: { commonName: 'issued' },
      publicKey: keys.publicKey,
      privateKey: samsung.privateKey,
      days,
    }),
    'CERTIFICATE',
  );

const lines: string[] = [];
const made: KeyPair[] = [];
let fresh = 0;

const order = (name: string, over: Record<string, unknown> = {}) => ({
  access,
  duid: '1900A2C4D6E8',
  log: (line: string) => lines.push(line),
  directory: join(base, name),
  generateKeys: () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    made.push(keys);
    return keys;
  },
  ...over,
});

beforeEach(() => {
  lines.length = 0;
  made.length = 0;
  fresh += 1;
  vi.mocked(keptDuids).mockReturnValue([]);
  vi.mocked(issueAuthor).mockImplementation(async () => issuedTo(made.at(-1) as KeyPair));
  vi.mocked(issueDistributor).mockImplementation(async () => ({
    certificate: issuedTo(made.at(-1) as KeyPair),
    deviceProfile: '<Profile />',
  }));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('requestCertificates', () => {
  it('keeps each certificate Samsung issued with the authority that issued it', async () => {
    const directory = join(base, `kept-${fresh}`);

    await requestCertificates(order(`kept-${fresh}`));

    expect(readFileSync(join(directory, 'author.pem'), 'utf8')).toContain(VD_AUTHOR_CA);
    expect(readFileSync(join(directory, 'distributor.pem'), 'utf8')).toContain(VD_PUBLIC_CA);
    expect(readFileSync(join(directory, 'device-profile.xml'), 'utf8')).toBe('<Profile />');
  });

  it('keeps each private key readable by its owner alone', async () => {
    const directory = join(base, `locked-${fresh}`);

    await requestCertificates(order(`locked-${fresh}`));

    expect(statSync(join(directory, 'author.key')).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, 'distributor.key')).mode & 0o777).toBe(0o600);
  });

  it('asks for the set by its DUID, after the empty package id', async () => {
    await requestCertificates(order(`asked-${fresh}`));

    const csr = vi.mocked(issueDistributor).mock.calls[0]?.[1] ?? '';
    const der = Buffer.from(csr.replaceAll(/-----[A-Z ]+-----|\s/g, ''), 'base64').toString(
      'latin1',
    );
    expect(der).toContain('URN:tizen:packageid=');
    expect(der).toContain('URN:tizen:deviceid=1900A2C4D6E8');
    expect(der).toContain('owner@example.com');
  });

  it('lists every set listed before beside the new one, each once', async () => {
    vi.mocked(keptDuids).mockReturnValue(['AB12CD34EF56', '1900A2C4D6E8']);

    const obtained = await requestCertificates(order(`listed-${fresh}`));

    expect(obtained.duids).toEqual(['AB12CD34EF56', '1900A2C4D6E8']);
    expect(lines.at(-1)).toBe(
      'asking Samsung for a distributor certificate for AB12CD34EF56, 1900A2C4D6E8',
    );
  });

  it('answers where it kept them and until when each is valid', async () => {
    const directory = join(base, `answered-${fresh}`);

    const obtained = await requestCertificates(order(`answered-${fresh}`));

    const author = new X509Certificate(readFileSync(join(directory, 'author.pem')));
    expect(obtained.directory).toBe(directory);
    expect(obtained.authorUntil).toEqual(new Date(author.validTo));
    expect(obtained.distributorUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps an author certificate that is still valid, and asks for the distributor alone', async () => {
    await requestCertificates(order(`reused-${fresh}`));
    vi.mocked(issueAuthor).mockClear();

    await requestCertificates(order(`reused-${fresh}`));

    expect(issueAuthor).not.toHaveBeenCalled();
    expect(issueDistributor).toHaveBeenCalledTimes(2);
  });

  it('asks for a new author certificate once the kept one has run out', async () => {
    await requestCertificates(order(`expired-${fresh}`));
    vi.mocked(issueAuthor).mockClear();
    const later = new Date(Date.now() + 400 * 86_400_000);

    await requestCertificates(order(`expired-${fresh}`, { now: later }));

    expect(issueAuthor).toHaveBeenCalledOnce();
  });

  it('refuses a certificate Samsung issued for another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.mocked(issueAuthor).mockResolvedValue(issuedTo(other));

    await expect(requestCertificates(order(`foreign-${fresh}`))).rejects.toThrow(
      'Samsung answered the author request with a certificate for another key',
    );
  });

  it('refuses a sign-in that named no address for the account', async () => {
    const anonymous = { ...access, email: null };

    await expect(
      requestCertificates(order(`anonymous-${fresh}`, { access: anonymous })),
    ).rejects.toThrow('the sign-in named no address for the Samsung account');
  });

  it('makes its own keys when it is handed no way to', async () => {
    const directory = join(base, `own-${fresh}`);
    vi.mocked(issueAuthor).mockRejectedValue(new Error('stop after the keys'));

    const asked = requestCertificates({ access, duid: '1900A2C4D6E8', log: () => {}, directory });

    await expect(asked).rejects.toThrow('stop after the keys');
    expect(vi.mocked(issueAuthor).mock.calls[0]?.[1]).toContain('BEGIN CERTIFICATE REQUEST');
  });
});
