import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { selfSignedCertificate, toPem } from './x509';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

const certificate = (days = 1825, from?: Date) =>
  new X509Certificate(
    selfSignedCertificate({
      subject: { commonName: 'KROMA', organization: 'KROMA', country: 'ch' },
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      days,
      from,
    }),
  );

describe('selfSignedCertificate', () => {
  it('writes a certificate the runtime parses back', () => {
    expect(certificate().subject).toContain('CN=KROMA');
  });

  it('names the same party as issuer and subject', () => {
    const parsed = certificate();

    expect(parsed.issuer).toBe(parsed.subject);
  });

  it('verifies against the key that signed it', () => {
    expect(certificate().verify(keys.publicKey)).toBe(true);
  });

  it('carries the country in upper case, as the encoding demands', () => {
    expect(certificate().subject).toContain('C=CH');
  });

  it('runs from the given day for as many days as asked', () => {
    const from = new Date('2026-01-01T00:00:00Z');

    const parsed = certificate(30, from);

    expect(new Date(parsed.validFrom).toISOString()).toBe(from.toISOString());
    expect(new Date(parsed.validTo).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('signs with SHA-256 and RSA', () => {
    const sha256WithRsa = Buffer.from('2a864886f70d01010b', 'hex');

    const der = selfSignedCertificate({
      subject: { commonName: 'KROMA' },
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      days: 1,
    });

    expect(der.includes(sha256WithRsa)).toBe(true);
    expect(certificate().publicKey.asymmetricKeyType).toBe('rsa');
  });
});

describe('toPem', () => {
  it('wraps the bytes in the armour a certificate file carries', () => {
    const pem = toPem(Buffer.from('kroma'), 'CERTIFICATE');

    expect(pem.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true);
    expect(pem.trimEnd().endsWith('-----END CERTIFICATE-----')).toBe(true);
  });

  it('leaves no blank line when the body ends exactly on a full line', () => {
    const exactlyOneLine = Buffer.alloc(48, 3);

    const pem = toPem(exactlyOneLine, 'CERTIFICATE');

    expect(pem.split('\n').filter((line) => line === '')).toHaveLength(1);
    expect(pem).toBe(
      `-----BEGIN CERTIFICATE-----\n${exactlyOneLine.toString('base64')}\n-----END CERTIFICATE-----\n`,
    );
  });

  it('breaks the body at 64 characters', () => {
    const pem = toPem(Buffer.alloc(120, 7), 'CERTIFICATE');
    const [, ...body] = pem.split('\n');

    expect(body[0]).toHaveLength(64);
  });
});
