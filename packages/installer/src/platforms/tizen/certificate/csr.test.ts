import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorSubject, certificationRequest, distributorSubject } from './csr';
import { OPENSSL } from './openssl';
import { toPem } from './x509';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function read(csr: Buffer, ...flags: string[]): string {
  const openssl = spawnSync(OPENSSL, ['req', '-noout', ...flags], {
    input: toPem(csr, 'CERTIFICATE REQUEST'),
    encoding: 'utf8',
  });
  return `${openssl.stdout}${openssl.stderr}`;
}

const author = () =>
  certificationRequest({ subject: authorSubject('KROMA'), publicKey, privateKey });

const distributor = (uris: string[]) =>
  certificationRequest({
    subject: distributorSubject('owner@example.com'),
    publicKey,
    privateKey,
    uris,
  });

describe('certificationRequest', () => {
  it('is a request openssl verifies against the key that signed it', () => {
    expect(read(author(), '-verify')).toMatch(
      /verify OK|Certificate request self-signature verify OK/i,
    );
  });

  it('is signed SHA-512 with RSA, as the Certificate Manager signs', () => {
    expect(read(author(), '-text')).toContain('sha512WithRSAEncryption');
  });

  it('asks for no extension when it names no alternative name', () => {
    expect(read(author(), '-text')).not.toContain('Subject Alternative Name');
  });

  it('asks for each address as an alternative name of the subject', () => {
    const csr = distributor(['URN:tizen:packageid=', 'URN:tizen:deviceid=1900A2C4D6E8']);

    const text = read(csr, '-text');

    expect(text).toContain('X509v3 Subject Alternative Name');
    expect(text).toContain('URI:URN:tizen:packageid=, URI:URN:tizen:deviceid=1900A2C4D6E8');
    expect(read(csr, '-verify')).toMatch(/verify OK/i);
  });
});

describe('authorSubject', () => {
  it('puts the name last, after the five fields sent empty', () => {
    const subject = read(author(), '-subject', '-nameopt', 'RFC2253');

    expect(subject.trim()).toBe('subject=CN=KROMA,OU=,O=,L=,ST=,C=');
  });

  it('writes a name outside the printable set as UTF-8', () => {
    const csr = certificationRequest({ subject: authorSubject('Zoé'), publicKey, privateKey });

    expect(read(csr, '-subject', '-nameopt', 'utf8,sep_comma_plus')).toContain('CN=Zoé');
  });
});

describe('distributorSubject', () => {
  it('is TizenSDK, with the address of the account that asks', () => {
    const subject = read(distributor([]), '-subject', '-nameopt', 'RFC2253');

    expect(subject.trim()).toBe(
      'subject=emailAddress=owner@example.com,C=,ST=,L=,O=,OU=,CN=TizenSDK',
    );
  });
});
