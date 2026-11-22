import { describe, expect, it } from 'vitest';
import { ascToken, readAscKey } from './asc-token';

const keyPair = () =>
  crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

async function pem(key: CryptoKey): Promise<string> {
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', key)).toString('base64');
  const lines = der.match(/.{1,64}/g) ?? [];
  return ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----'].join('\n');
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('ascToken', () => {
  it('signs a token App Store Connect can verify with the public half of the key', async () => {
    const pair = await keyPair();
    const key = { keyId: 'KEY123', issuerId: 'issuer-1', privateKey: await pem(pair.privateKey) };

    const token = await ascToken(key, Date.UTC(2026, 10, 22, 12));
    const [header = '', claims = '', signature = ''] = token.split('.');
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`),
    );

    expect(valid).toBe(true);
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: 'issuer-1',
      iat: 1_795_348_800,
      exp: 1_795_349_400,
      aud: 'appstoreconnect-v1',
    });
  });
});

describe('readAscKey', () => {
  it('reads the three variables the release environment sets', () => {
    const env = { ASC_KEY_ID: 'k', ASC_ISSUER_ID: 'i', ASC_PRIVATE_KEY: 'p' };

    expect(readAscKey(env)).toEqual({ keyId: 'k', issuerId: 'i', privateKey: 'p' });
  });

  it('is null when one of them is missing, as on a fork', () => {
    expect(readAscKey({ ASC_KEY_ID: 'k', ASC_ISSUER_ID: 'i' })).toBeNull();
  });
});
