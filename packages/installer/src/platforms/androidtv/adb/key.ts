import {
  constants,
  createPrivateKey,
  generateKeyPairSync,
  type KeyObject,
  privateEncrypt,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

const MODULUS_BYTES = 256;
const WORD = 2n ** 32n;
const SHA1_DIGEST_INFO = Buffer.from('3021300906052b0e03021a05000414', 'hex');
const LARGEST_KEY_FILE = 16_384;

/** Where this tool keeps the key a TV is asked to trust. */
export const KROMA_ADB_KEY = join(homedir(), '.kroma', 'adb', 'adbkey');

/** The key Google's own adb keeps, which a TV may already trust. */
export const ANDROID_ADB_KEY = join(homedir(), '.android', 'adbkey');

export interface AdbKey {
  privateKey: KeyObject;
  publicKey: string;
}

function littleEndian(value: bigint, bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  let rest = value;
  for (let at = 0; at < bytes; at += 1) {
    out[at] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function fromBase64Url(text: string): bigint {
  return BigInt(`0x${Buffer.from(text, 'base64url').toString('hex')}`);
}

function inverseModWord(odd: bigint): bigint {
  let inverse = 1n;
  for (let step = 0; step < 5; step += 1) inverse = (inverse * (2n - odd * inverse)) % WORD;
  return ((inverse % WORD) + WORD) % WORD;
}

/**
 * The public half of a key in the form a TV stores it: Android's own
 * RSAPublicKey struct, base64, then a name for whoever looks at the list.
 */
export function androidPublicKey(privateKey: KeyObject, label = `kroma@${hostname()}`): string {
  const jwk = privateKey.export({ format: 'jwk' });
  if (!jwk.n || !jwk.e) throw new Error('the adb key is not an RSA key');
  const modulus = fromBase64Url(jwk.n);
  const exponent = Number(fromBase64Url(jwk.e));
  if (modulus >> 2040n === 0n || modulus >> 2048n !== 0n) {
    throw new Error('the adb key is not a 2048-bit RSA key');
  }

  const struct = Buffer.alloc(3 * 4 + 2 * MODULUS_BYTES);
  struct.writeUInt32LE(MODULUS_BYTES / 4, 0);
  struct.writeUInt32LE(Number((WORD - inverseModWord(modulus % WORD)) % WORD), 4);
  littleEndian(modulus, MODULUS_BYTES).copy(struct, 8);
  littleEndian(2n ** BigInt(MODULUS_BYTES * 8 * 2) % modulus, MODULUS_BYTES).copy(
    struct,
    8 + MODULUS_BYTES,
  );
  struct.writeUInt32LE(exponent, 8 + 2 * MODULUS_BYTES);
  return `${struct.toString('base64')} ${label}`;
}

/** Signs the token a TV sends the way adb does: the token stands in for a SHA-1 digest. */
export function signToken(privateKey: KeyObject, token: Buffer): Buffer {
  return privateEncrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.concat([SHA1_DIGEST_INFO, token]),
  );
}

async function readKey(path: string): Promise<AdbKey | null> {
  try {
    const pem = await readFile(path, 'utf8');
    if (pem.length > LARGEST_KEY_FILE) return null;
    const privateKey = createPrivateKey(pem);
    return { privateKey, publicKey: androidPublicKey(privateKey) };
  } catch {
    return null;
  }
}

/** This tool's own key, made the first time and readable by its owner alone. */
export async function kromaKey(path = KROMA_ADB_KEY): Promise<AdbKey> {
  const kept = await readKey(path);
  if (kept) return kept;

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  return { privateKey, publicKey: androidPublicKey(privateKey) };
}

export interface KeyPlaces {
  android?: string;
  kroma?: string;
}

/**
 * The keys to offer a TV, in order: Google's adb key when this computer has
 * one, so a TV that already trusts it asks nothing, then this tool's own,
 * made the first time.
 */
export async function adbKeys(places: KeyPlaces = {}): Promise<AdbKey[]> {
  const theirs = await readKey(places.android ?? ANDROID_ADB_KEY);
  const ours = await kromaKey(places.kroma ?? KROMA_ADB_KEY);
  return theirs ? [theirs, ours] : [ours];
}

/** The keys this computer already has, making none: what a scan offers. */
export async function existingAdbKeys(places: KeyPlaces = {}): Promise<AdbKey[]> {
  const found = await Promise.all([
    readKey(places.android ?? ANDROID_ADB_KEY),
    readKey(places.kroma ?? KROMA_ADB_KEY),
  ]);
  return found.filter((key) => key !== null);
}
