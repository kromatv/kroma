import { createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import { adbCertificate } from './secure';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });

/** What a fake TV presents over TLS, and asks of whoever connects to it. */
export const SERVER_TLS = {
  key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  cert: adbCertificate(privateKey),
  requestCert: true,
  rejectUnauthorized: false,
  minVersion: 'TLSv1.3',
} as const;

function spki(key: KeyObject): Buffer {
  const shown = key.type === 'private' ? createPublicKey(key) : key;
  return shown.export({ format: 'der', type: 'spki' });
}

/** True when the certificate the client showed carries one of the keys given. */
export function presented(socket: TLSSocket, keys: readonly KeyObject[]): boolean {
  const shown = socket.getPeerX509Certificate()?.publicKey;
  return shown !== undefined && keys.some((key) => spki(key).equals(spki(shown)));
}
