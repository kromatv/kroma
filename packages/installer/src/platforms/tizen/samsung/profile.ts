import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pemCertificates } from '../certificate/signing-key';
import type { SigningProfile } from '../profiles';

/** Where the certificates this tool got from Samsung are kept. */
export const SAMSUNG_PROFILE = join(homedir(), '.kroma', 'certificates', 'samsung');

const DEVICE_ID = /(?<=URN:tizen:deviceid=)[A-Za-z0-9]+/g;

export interface SamsungFiles {
  authorKey: string;
  authorChain: string;
  distributorKey: string;
  distributorChain: string;
  deviceProfile: string;
}

export function samsungFiles(directory = SAMSUNG_PROFILE): SamsungFiles {
  return {
    authorKey: join(directory, 'author.key'),
    authorChain: join(directory, 'author.pem'),
    distributorKey: join(directory, 'distributor.key'),
    distributorChain: join(directory, 'distributor.pem'),
    deviceProfile: join(directory, 'device-profile.xml'),
  };
}

/** The profile Samsung issued to this tool, once both of its halves are kept. */
export function readSamsungProfile(directory = SAMSUNG_PROFILE): SigningProfile | null {
  const files = samsungFiles(directory);
  const kept = [files.authorKey, files.authorChain, files.distributorKey, files.distributorChain];
  if (!kept.every((path) => existsSync(path))) return null;
  return {
    name: 'samsung',
    author: { key: files.authorKey, chain: files.authorChain },
    distributor: { key: files.distributorKey, chain: files.distributorChain },
  };
}

/** The device ids a subject alternative name lists, as a distributor certificate carries them. */
export function duidsIn(subjectAltName: string | undefined): string[] {
  return [...(subjectAltName ?? '').matchAll(DEVICE_ID)].map(([duid]) => duid);
}

/** When the leaf of a kept chain stops being valid, or null when none is kept. */
export function keptUntil(chain: string): Date | null {
  if (!existsSync(chain)) return null;
  const [leaf] = pemCertificates(readFileSync(chain, 'utf8'));
  return leaf ? new Date(leaf.validTo) : null;
}

/** Whether the certificates Samsung issued to this tool sign for a set today. */
export function coversSet(duid: string, now = new Date(), directory = SAMSUNG_PROFILE): boolean {
  const files = samsungFiles(directory);
  const valid = [keptUntil(files.authorChain), keptUntil(files.distributorChain)].every(
    (until) => until !== null && until > now,
  );
  return valid && keptDuids(directory).includes(duid);
}

/** The sets the kept distributor certificate was issued for. */
export function keptDuids(directory = SAMSUNG_PROFILE): string[] {
  const { distributorChain } = samsungFiles(directory);
  if (!existsSync(distributorChain)) return [];
  const [leaf] = pemCertificates(readFileSync(distributorChain, 'utf8'));
  return duidsIn(leaf?.subjectAltName);
}
