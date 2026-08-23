import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runOk } from '../../../run';
import { OPENSSL } from './openssl';
import { type Subject, selfSignedCertificate, toPem } from './x509';

const KEY_BITS = 2048;
const VALID_DAYS = 1825;
// Java reads a PKCS#12 written this way without an argument. OpenSSL 3 defaults
// to AES-256 with PBKDF2, which the JRE bundled with Tizen Studio refuses.
const JAVA_READABLE = ['-certpbe', 'PBE-SHA1-3DES', '-keypbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'];

export interface AuthorCertificate {
  directory: string;
  certificate: string;
  key: string;
  archive: string;
  password: string;
  passwordFile: string;
}

export interface AuthorRequest {
  directory: string;
  alias: string;
  password: string;
  subject: Subject;
  days?: number;
}

/**
 * An author certificate of this machine's own: an RSA key, a self-signed X.509
 * over it, and the PKCS#12 the Tizen tools sign with. It is the whole chain for
 * an emulator, and half of it for a retail set, whose distributor certificate
 * only Samsung can issue.
 */
export async function createAuthorCertificate(request: AuthorRequest): Promise<AuthorCertificate> {
  const { directory, alias, password, subject } = request;
  await mkdir(directory, { recursive: true });

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: KEY_BITS });
  const certificate = selfSignedCertificate({
    subject,
    publicKey,
    privateKey,
    days: request.days ?? VALID_DAYS,
  });

  const paths = {
    certificate: join(directory, 'author.crt'),
    key: join(directory, 'author.key'),
    archive: join(directory, 'author.p12'),
    passwordFile: join(directory, 'author.pwd'),
  };
  await writeFile(paths.certificate, toPem(certificate, 'CERTIFICATE'));
  await writeFile(paths.key, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  await writeFile(paths.passwordFile, password, { mode: 0o600 });
  await pack(paths, alias, password);

  return { directory, password, ...paths };
}

async function pack(
  paths: { certificate: string; key: string; archive: string },
  alias: string,
  password: string,
): Promise<void> {
  if (!existsSync(OPENSSL)) throw new Error('openssl is needed to write the .p12 and is not here');
  await runOk([
    OPENSSL,
    'pkcs12',
    '-export',
    '-inkey',
    paths.key,
    '-in',
    paths.certificate,
    '-out',
    paths.archive,
    '-name',
    alias,
    '-passout',
    `pass:${password}`,
    ...JAVA_READABLE,
  ]);
}
