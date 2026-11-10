import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { utils } from 'ssh2';
import { fetchText } from '../../../discovery/http';

const WEBOS_KEYS = join(homedir(), '.kroma', 'keys', 'webos');

const KEY_SERVER_PORT = 9991;

const KEY_PATH = '/webos_rsa';
const MAX_KEY_BYTES = 16 * 1024;
const KEY_TIMEOUT_MS = 10_000;
const PRIVATE = 0o600;
const OWNER_ONLY = 0o700;

export interface KeyStore {
  directory: string;
  keyServerPort: number;
}

export const DEFAULT_KEY_STORE: KeyStore = {
  directory: WEBOS_KEYS,
  keyServerPort: KEY_SERVER_PORT,
};

/** The file a television's key is kept in. */
export function keptKeyPath(host: string, directory = WEBOS_KEYS): string {
  return join(directory, `${host.replaceAll(/[^\w.-]/g, '_')}.pem`);
}

/**
 * The key to open an SSH session on a set with. A passphrase fetches the set's
 * key from its key server, opens it, and keeps it opened for the next install;
 * no passphrase reads the one kept from before.
 */
export async function devModeKey(
  host: string,
  passphrase: string | undefined,
  store: KeyStore = DEFAULT_KEY_STORE,
): Promise<string> {
  if (passphrase) return fetchKey(host, passphrase, store);
  const kept = await keptKey(host, store.directory);
  if (kept) return kept;
  throw new Error(
    `this computer holds no key for ${host} yet: give the passphrase the Dev Mode app shows`,
  );
}

async function fetchKey(host: string, passphrase: string, store: KeyStore): Promise<string> {
  const url = `http://${host}:${store.keyServerPort}${KEY_PATH}`;
  const encrypted = await fetchText(url, { timeoutMs: KEY_TIMEOUT_MS, maxBytes: MAX_KEY_BYTES });
  if (encrypted === null) {
    throw new Error(
      `the key server of ${host} did not answer on ${store.keyServerPort}: open the Dev Mode app and turn Key Server on`,
    );
  }

  const opened = openKey(encrypted, passphrase);
  if (!opened) {
    throw new Error(
      `the key of ${host} did not open with that passphrase: type the one the Dev Mode app shows`,
    );
  }

  await mkdir(store.directory, { recursive: true, mode: OWNER_ONLY });
  await chmod(store.directory, OWNER_ONLY);
  const path = keptKeyPath(host, store.directory);
  await writeFile(path, opened, { mode: PRIVATE });
  await chmod(path, PRIVATE);
  return opened;
}

async function keptKey(host: string, directory: string): Promise<string | null> {
  const path = keptKeyPath(host, directory);
  if (!existsSync(path) || (await stat(path)).size > MAX_KEY_BYTES) return null;
  return openKey(await readFile(path, 'utf8'));
}

function openKey(text: string, passphrase?: string): string | null {
  const parsed = utils.parseKey(text, passphrase);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key || key instanceof Error || !key.isPrivateKey()) return null;
  return key.getPrivatePEM();
}
