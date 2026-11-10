import {
  constants,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  publicDecrypt,
} from 'node:crypto';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { adbKeys, androidPublicKey, existingAdbKeys, kromaKey, signToken } from './key';

const base = mkdtempSync(join(tmpdir(), 'kroma-adb-key-'));
const at = (name: string) => join(base, name, 'adbkey');
const rsa = (bits = 2048): KeyObject =>
  generateKeyPairSync('rsa', { modulusLength: bits, publicExponent: 65537 }).privateKey;
const key = rsa();

function fromLittleEndian(bytes: Buffer): bigint {
  return BigInt(`0x${Buffer.from(bytes).reverse().toString('hex')}`);
}

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('androidPublicKey', () => {
  it('lays out the modulus, its Montgomery values and the exponent as Android reads them', () => {
    const struct = Buffer.from(androidPublicKey(key, 'kroma@test').split(' ')[0] ?? '', 'base64');
    const jwk = key.export({ format: 'jwk' });
    const modulus = BigInt(`0x${Buffer.from(jwk.n ?? '', 'base64url').toString('hex')}`);

    expect(struct.length).toBe(524);
    expect(struct.readUInt32LE(0)).toBe(64);
    expect(fromLittleEndian(struct.subarray(8, 264))).toBe(modulus);
    expect((BigInt(struct.readUInt32LE(4)) * modulus + 1n) % 2n ** 32n).toBe(0n);
    expect(fromLittleEndian(struct.subarray(264, 520))).toBe(2n ** 4096n % modulus);
    expect(struct.readUInt32LE(520)).toBe(65537);
  });

  it('names the key after whoever made it', () => {
    expect(androidPublicKey(key, 'kroma@salon').endsWith(' kroma@salon')).toBe(true);
  });

  it('refuses a key that is not 2048 bits', () => {
    expect(() => androidPublicKey(rsa(1024))).toThrow('not a 2048-bit RSA key');
  });

  it('refuses a key that is not RSA', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;

    expect(() => androidPublicKey(ec)).toThrow('not an RSA key');
  });
});

describe('signToken', () => {
  it('signs the token as if it were a SHA-1 digest', () => {
    const token = Buffer.alloc(20, 7);

    const signature = signToken(key, token);
    const plain = publicDecrypt(
      { key: createPublicKey(key), padding: constants.RSA_PKCS1_PADDING },
      signature,
    );

    expect(plain.toString('hex')).toBe(`3021300906052b0e03021a05000414${token.toString('hex')}`);
  });
});

describe('kromaKey', () => {
  it('makes a key the first time, readable by its owner alone', async () => {
    const path = at('first');

    await kromaKey(path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('gives the same key every time after that', async () => {
    const path = at('again');

    const first = await kromaKey(path);
    const second = await kromaKey(path);

    expect(second.publicKey).toBe(first.publicKey);
  });
});

describe('adbKeys', () => {
  it('offers the key of Google adb first when this computer has one', async () => {
    const android = join(base, 'android-adbkey');
    writeFileSync(android, key.export({ format: 'pem', type: 'pkcs1' }));

    const keys = await adbKeys({ android, kroma: at('both') });

    expect(keys).toHaveLength(2);
    expect(keys[0]?.publicKey.split(' ')[0]).toBe(androidPublicKey(key).split(' ')[0]);
  });

  it('offers only its own key when there is no other', async () => {
    expect(await adbKeys({ android: join(base, 'none'), kroma: at('alone') })).toHaveLength(1);
  });

  it('ignores a key file far larger than a key', async () => {
    const android = join(base, 'huge-adbkey');
    writeFileSync(android, 'x'.repeat(20_000));

    expect(await adbKeys({ android, kroma: at('huge') })).toHaveLength(1);
  });
});

describe('existingAdbKeys', () => {
  it('makes no key when this computer has none', async () => {
    const kroma = at('untouched');

    expect(await existingAdbKeys({ android: join(base, 'none'), kroma })).toEqual([]);
    expect(() => statSync(kroma)).toThrow();
  });

  it('offers the keys already there', async () => {
    const kroma = at('kept');
    await kromaKey(kroma);

    expect(await existingAdbKeys({ android: join(base, 'none'), kroma })).toHaveLength(1);
  });
});
