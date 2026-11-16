import { createPrivateKey, generateKeyPairSync, verify } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { appJwt, privateKeyBytes } from './app-jwt';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

let pkcs1 = '';
let publicKey = '';

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  pkcs1 = pair.privateKey;
  publicKey = pair.publicKey;
}, 60_000);

describe('appJwt', () => {
  it('signs with the PKCS#1 key GitHub hands out, verifiably, for nine minutes', async () => {
    const jwt = await appJwt('123', pkcs1, 1_000);

    const [header = '', payload = '', signature = ''] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(payload)).toEqual({ iat: 940, exp: 1_540, iss: '123' });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('reads a key already converted to PKCS#8 to the same bytes', () => {
    const pkcs8 = createPrivateKey(pkcs1).export({ type: 'pkcs8', format: 'pem' }).toString();

    expect(privateKeyBytes(pkcs8)).toEqual(privateKeyBytes(pkcs1));
  });

  it('refuses anything that is not an RSA key', () => {
    expect(() => privateKeyBytes('hello')).toThrow('not a PEM RSA key');
  });
});
