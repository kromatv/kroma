import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PROFILES_XML = join(
  process.env.TIZEN_DATA ?? join(homedir(), 'tizen-studio-data'),
  'profile',
  'profiles.xml',
);

export interface ProfileKey {
  archive: string;
  password: string;
}

export interface ProfileRequest {
  name: string;
  author: ProfileKey;
  distributor?: ProfileKey;
}

const attribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export function profilesXml(request: ProfileRequest): string {
  const item = (index: number, key: ProfileKey | undefined) =>
    `<profileitem ca="" distributor="${index}" key="${attribute(key?.archive ?? '')}" password="${attribute(key?.password ?? '')}" rootca=""/>`;

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<profiles active="${attribute(request.name)}" version="3.1">`,
    `<profile name="${attribute(request.name)}">`,
    item(0, request.author),
    item(1, request.distributor),
    item(2, undefined),
    '</profile>',
    '</profiles>',
    '',
  ].join('\n');
}

/**
 * Writes the profile the Tizen tools sign with. It refuses a file that already
 * exists: the Tizen CLI merges into that one, and this writer would take the
 * other profiles with it.
 */
export async function writeProfile(request: ProfileRequest): Promise<string> {
  if (existsSync(PROFILES_XML)) {
    throw new Error(`${PROFILES_XML} already holds profiles: add to it with the Tizen CLI`);
  }
  await mkdir(dirname(PROFILES_XML), { recursive: true });
  await writeFile(PROFILES_XML, profilesXml(request));
  return PROFILES_XML;
}
