import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Pkcs12, readPkcs12 } from './pkcs12';
import type { ProfileKey } from './profile';

const CERTIFICATE = /-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g;

/** A signing key kept as two PEM files: the private key, and its chain, leaf first. */
export interface PemKey {
  key: string;
  chain: string;
}

export type SigningKey = ProfileKey | PemKey;

/** The certificates a PEM text holds, in the order it holds them. */
export function pemCertificates(pem: string): X509Certificate[] {
  return [...pem.matchAll(CERTIFICATE)].map(([block]) => new X509Certificate(block));
}

/** The key a signature is made with and its chain, leaf first, wherever it is kept. */
export function readSigningKey(source: SigningKey): Pkcs12 {
  if ('archive' in source) return readPkcs12(source);

  const key = createPrivateKey(readFileSync(source.key));
  const chain = pemCertificates(readFileSync(source.chain, 'utf8'));
  if (!chain[0]?.checkPrivateKey(key)) {
    throw new Error(`${source.chain} does not start with the certificate of ${source.key}`);
  }
  return { key, chain };
}
