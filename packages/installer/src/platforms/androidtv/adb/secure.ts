import { createPublicKey, type KeyObject } from 'node:crypto';
import type { Socket } from 'node:net';
import { connect, type TLSSocket } from 'node:tls';
import { selfSignedCertificate, toPem } from '../../../shared/x509';

const VALID_DAYS = 3650;

export type TlsTarget = { socket: Socket } | { host: string; port: number };

/**
 * The certificate adb shows a TV over TLS: self-signed, and read by the TV for
 * its public key alone.
 */
export function adbCertificate(privateKey: KeyObject): string {
  const certificate = selfSignedCertificate({
    subject: { commonName: 'Adb', organization: 'Android', country: 'US' },
    publicKey: createPublicKey(privateKey),
    privateKey,
    days: VALID_DAYS,
  });
  return toPem(certificate, 'CERTIFICATE');
}

/**
 * Speaks TLS 1.3 to a TV as adb does, over a socket already open or a new one:
 * this computer's adb key is the client certificate, and the TV's own
 * certificate is taken as it comes.
 */
export function secure(
  target: TlsTarget,
  privateKey: KeyObject,
  timeoutMs: number,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      ...target,
      key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
      cert: adbCertificate(privateKey),
      rejectUnauthorized: false,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
    });
    const failed = (error: Error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => failed(new Error('the TV did not finish TLS')), timeoutMs);
    socket.once('error', failed);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      socket.removeListener('error', failed);
      resolve(socket);
    });
  });
}
