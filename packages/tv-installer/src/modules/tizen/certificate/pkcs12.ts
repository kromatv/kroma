import { spawnSync } from 'node:child_process';
import { createPrivateKey, type KeyObject, X509Certificate } from 'node:crypto';
import { OPENSSL } from './openssl';
import type { ProfileKey } from './profile';

const PEM_BLOCK = /-----BEGIN ([A-Z ]+)-----[^-]+-----END \1-----/g;

export interface Pkcs12 {
  key: KeyObject;
  chain: X509Certificate[];
}

/**
 * The signing key and its certificate chain, leaf first. `node:crypto` cannot
 * open a PKCS#12, so openssl unpacks it; the password goes in over stdin and the
 * key comes back over a pipe, so neither reaches the process table or the disk.
 */
export function readPkcs12({ archive, password }: ProfileKey): Pkcs12 {
  const openssl = spawnSync(OPENSSL, ['pkcs12', '-in', archive, '-passin', 'stdin', '-nodes'], {
    input: `${password}\n`,
    encoding: 'utf8',
  });
  if (openssl.error) throw new Error('openssl is needed to read a .p12 and is not here');
  if (openssl.status !== 0) {
    throw new Error(`openssl could not open ${archive}: ${openssl.stderr.trim()}`);
  }

  const blocks = [...openssl.stdout.matchAll(PEM_BLOCK)];
  const keyBlock = blocks.find(([, label]) => label?.endsWith('PRIVATE KEY'));
  if (!keyBlock) throw new Error(`${archive} holds no private key`);

  const key = createPrivateKey(keyBlock[0]);
  const certificates = blocks
    .filter(([, label]) => label === 'CERTIFICATE')
    .map(([block]) => new X509Certificate(block));
  return { key, chain: chainFrom(certificates, key) };
}

function chainFrom(certificates: X509Certificate[], key: KeyObject): X509Certificate[] {
  const leaf = certificates.find((certificate) => certificate.checkPrivateKey(key));
  if (!leaf) throw new Error('no certificate in the .p12 belongs to its private key');

  const chain = [leaf];
  const rest = certificates.filter((certificate) => certificate !== leaf);
  while (rest.length > 0) {
    const issuer = chain.at(-1)?.issuer;
    const next = rest.findIndex((certificate) => certificate.subject === issuer);
    if (next < 0) break;
    chain.push(...rest.splice(next, 1));
  }
  return chain;
}
