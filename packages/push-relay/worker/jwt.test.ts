import { describe, expect, it } from 'vitest';
import { b64url, fromB64url, importEs256, importRs256, sign } from './jwt';

const utf8 = new TextEncoder();

async function pemFor(algorithm: 'ECDSA' | 'RSASSA-PKCS1-v1_5', label = 'PRIVATE KEY') {
  const params =
    algorithm === 'ECDSA'
      ? { name: 'ECDSA' as const, namedCurve: 'P-256' }
      : {
          name: 'RSASSA-PKCS1-v1_5' as const,
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        };
  const pair = await crypto.subtle.generateKey(params, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...pkcs8))
    .match(/.{1,64}/g)
    ?.join('\n');
  return {
    pem: `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`,
    publicKey: pair.publicKey,
  };
}

const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromB64url(part)));

describe('b64url', () => {
  it('never pads, whatever the byte length', () => {
    for (let length = 0; length < 6; length++) {
      expect(b64url(new Uint8Array(length))).not.toContain('=');
    }
  });

  it('uses the URL-safe alphabet, so nothing has to be escaped in a header', () => {
    const encoded = b64url(new Uint8Array([251, 255, 190, 255]));
    expect(encoded).not.toMatch(/[+/]/);
    expect(encoded).toMatch(/^[\w-]+$/);
  });

  it('takes an ArrayBuffer as readily as a view over one', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    expect(b64url(bytes.buffer)).toBe(b64url(bytes));
  });

  it('round-trips through fromB64url at every padding remainder', () => {
    for (let length = 0; length < 8; length++) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37 + 200) % 256));
      expect([...fromB64url(b64url(bytes))]).toEqual([...bytes]);
    }
  });
});

describe('importing a key', () => {
  it('reads a PKCS#8 block whatever label the PEM carries', async () => {
    const { pem } = await pemFor('ECDSA', 'EC PRIVATE KEY');
    await expect(importEs256(pem)).resolves.toBeDefined();
  });

  it('refuses a PEM with nothing between the markers', () => {
    expect(() => importRs256('-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----')).toThrow(
      'empty PEM',
    );
  });
});

describe('sign', () => {
  it('signs the ES256 assertion Apple verifies, header and claims intact', async () => {
    const { pem, publicKey } = await pemFor('ECDSA');
    const key = await importEs256(pem);
    const jwt = await sign(key, { alg: 'ES256', kid: 'ABC1234567' }, { iss: 'TEAM', iat: 42 });

    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'ABC1234567' });
    expect(decode(claims)).toEqual({ iss: 'TEAM', iat: 42 });
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        fromB64url(signature),
        utf8.encode(`${header}.${claims}`),
      ),
    ).toBe(true);
  });

  it('picks RSASSA for a Google service-account key, not ECDSA', async () => {
    const { pem, publicKey } = await pemFor('RSASSA-PKCS1-v1_5');
    const key = await importRs256(pem);
    const jwt = await sign(key, { alg: 'RS256', typ: 'JWT' }, { iss: 'relay@x', iat: 42 });

    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        fromB64url(signature),
        utf8.encode(`${header}.${claims}`),
      ),
    ).toBe(true);
  });
});
