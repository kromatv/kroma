import { generateKeyPairSync, type KeyObject, X509Certificate } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { LogLine } from '../../../run';
import { authorSubject, certificationRequest, distributorSubject } from '../certificate/csr';
import { toPem } from '../certificate/x509';
import type { SamsungAccess } from './access';
import { VD_AUTHOR_CA, VD_PUBLIC_CA } from './authorities';
import { issueAuthor, issueDistributor } from './issuer';
import { keptDuids, keptUntil, SAMSUNG_PROFILE, samsungFiles } from './profile';

const KEY_BITS = 2048;
const AUTHOR_NAME = 'KROMA';
const PRIVATE = 0o600;
const OWNER_ONLY = 0o700;
const REQUEST = 'CERTIFICATE REQUEST';

export interface KeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export interface CertificateOrder {
  access: SamsungAccess;
  duid: string;
  log: LogLine;
  directory?: string;
  now?: Date;
  generateKeys?: () => KeyPair;
}

export interface Obtained {
  directory: string;
  duids: string[];
  authorUntil: Date;
  distributorUntil: Date;
}

const rsaKeys = (): KeyPair => generateKeyPairSync('rsa', { modulusLength: KEY_BITS });

const pkcs8 = (key: KeyObject) => key.export({ format: 'pem', type: 'pkcs8' });

function issuedFor(pem: string, key: KeyObject, kind: string): X509Certificate {
  const certificate = new X509Certificate(pem);
  if (!certificate.checkPrivateKey(key)) {
    throw new Error(`Samsung answered the ${kind} request with a certificate for another key`);
  }
  return certificate;
}

/**
 * Gets Samsung's two certificates for a set and keeps them for every install.
 * An author certificate still valid is kept as it is, because an update must be
 * signed by the author of what is installed. The distributor is always asked
 * for again, listing this set with every set listed before.
 */
export async function requestCertificates(order: CertificateOrder): Promise<Obtained> {
  const { access, duid, log, directory = SAMSUNG_PROFILE, generateKeys = rsaKeys } = order;
  const now = order.now ?? new Date();
  const files = samsungFiles(directory);
  if (!access.email) throw new Error('the sign-in named no address for the Samsung account');
  await mkdir(directory, { recursive: true, mode: OWNER_ONLY });

  let authorUntil = keptUntil(files.authorChain);
  if (authorUntil === null || authorUntil <= now) {
    log('asking Samsung for an author certificate');
    const keys = generateKeys();
    const csr = certificationRequest({ subject: authorSubject(AUTHOR_NAME), ...keys });
    const pem = await issueAuthor(access, toPem(csr, REQUEST));
    authorUntil = new Date(issuedFor(pem, keys.privateKey, 'author').validTo);
    await writeFile(files.authorKey, pkcs8(keys.privateKey), { mode: PRIVATE });
    await writeFile(files.authorChain, `${pem}${VD_AUTHOR_CA}`);
  }

  const duids = [...new Set([...keptDuids(directory), duid])];
  log(`asking Samsung for a distributor certificate for ${duids.join(', ')}`);
  const keys = generateKeys();
  const uris = ['URN:tizen:packageid=', ...duids.map((id) => `URN:tizen:deviceid=${id}`)];
  const csr = certificationRequest({ subject: distributorSubject(access.email), ...keys, uris });
  const issued = await issueDistributor(access, toPem(csr, REQUEST));
  const leaf = issuedFor(issued.certificate, keys.privateKey, 'distributor');
  await writeFile(files.distributorKey, pkcs8(keys.privateKey), { mode: PRIVATE });
  await writeFile(files.distributorChain, `${issued.certificate}${VD_PUBLIC_CA}`);
  await writeFile(files.deviceProfile, issued.deviceProfile);

  return { directory, duids, authorUntil, distributorUntil: new Date(leaf.validTo) };
}
