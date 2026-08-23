import { existsSync, readFileSync } from 'node:fs';
import { run } from '../../run';
import type { ProfileKey } from './certificate/profile';
import { PROFILES_XML } from './certificate/profile';

const PROFILE_BLOCK = /<profile\s+name="([^"]*)"\s*>([\s\S]*?)<\/profile>/g;
const PROFILE_ITEM = /<profileitem\b([^>]*)\/>/g;
const ATTRIBUTE = /(\w{1,64})="([^"]*)"/g;
const ACTIVE = /<profiles[^>]*\bactive="([^"]*)"/;
const KEYCHAIN_TIMEOUT_MS = 20_000;

export interface SigningProfile {
  name: string;
  author: ProfileKey;
  distributor?: ProfileKey;
}

interface RawKey {
  key: string;
  password: string;
}

export interface ParsedProfiles {
  active: string | null;
  profiles: Map<string, Map<string, RawKey>>;
}

export function parseProfiles(xml: string): ParsedProfiles {
  const profiles = new Map<string, Map<string, RawKey>>();
  for (const [, name = '', body = ''] of xml.matchAll(PROFILE_BLOCK)) {
    const items = new Map<string, RawKey>();
    for (const [, attributes = ''] of body.matchAll(PROFILE_ITEM)) {
      const fields = Object.fromEntries(
        [...attributes.matchAll(ATTRIBUTE)].map(([, key = '', value = '']) => [key, value]),
      );
      if (fields.key)
        items.set(fields.distributor ?? '', { key: fields.key, password: fields.password ?? '' });
    }
    profiles.set(name, items);
  }
  return { active: ACTIVE.exec(xml)?.[1] ?? null, profiles };
}

/**
 * The profile the Tizen tools would sign with, read out of their own file so
 * that signing needs none of those tools. Without a name, the active one.
 */
export async function readProfile(name?: string): Promise<SigningProfile | null> {
  if (!existsSync(PROFILES_XML)) return null;
  const { active, profiles } = parseProfiles(readFileSync(PROFILES_XML, 'utf8'));

  const wanted = name ?? active;
  const items = wanted ? profiles.get(wanted) : undefined;
  const author = items?.get('0');
  if (!wanted || !author) return null;

  const distributor = items?.get('1');
  return {
    name: wanted,
    author: { archive: author.key, password: await secret(author.password) },
    ...(distributor
      ? { distributor: { archive: distributor.key, password: await secret(distributor.password) } }
      : {}),
  };
}

/**
 * A password as the Tizen tools store it: inline, in a file beside the
 * certificate, or, on macOS, in the login keychain under the name of a file
 * that was never written.
 */
async function secret(value: string): Promise<string> {
  if (!value.endsWith('.pwd')) return value;
  if (existsSync(value)) return readFileSync(value, 'utf8').trim();

  const { code, output } = await run(['security', 'find-generic-password', '-a', value, '-w'], {
    timeoutMs: KEYCHAIN_TIMEOUT_MS,
  });
  return code === 0 ? output.trim() : '';
}

export const activeProfile = () => readProfile();
