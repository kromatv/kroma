import { describe, expect, it } from 'vitest';
import { ascToken, highestBuild, importP8 } from './asc';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const generated = () =>
  crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

const verifies = (publicKey: CryptoKey, token: string) => {
  const [header = '', claims = '', signature = ''] = token.split('.');
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    Buffer.from(signature, 'base64url'),
    new TextEncoder().encode(`${header}.${claims}`),
  );
};

describe('ascToken', () => {
  it('names the key and the team, and lives ten minutes', async () => {
    const { privateKey } = await generated();
    const now = new Date('2026-10-31T04:00:00Z');

    const token = await ascToken(
      { keyId: 'KEY123', issuerId: 'issuer-1', signingKey: privateKey },
      now,
    );
    const [header = '', claims = ''] = token.split('.');

    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: 'issuer-1',
      iat: 1793419200,
      exp: 1793419800,
      aud: 'appstoreconnect-v1',
    });
  });

  it('signs with the raw signature JOSE wants, so the public key verifies it', async () => {
    const pair = await generated();
    const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

    const signingKey = await importP8(Buffer.from(der).toString('base64'));
    const token = await ascToken({ keyId: 'KEY123', issuerId: 'issuer-1', signingKey });

    expect(await verifies(pair.publicKey, token)).toBe(true);
  });
});

describe('highestBuild', () => {
  it('takes the highest numeric build, whatever the upload order', () => {
    const page = {
      data: [
        { attributes: { version: '3592600' } },
        { attributes: { version: '3592672' } },
        { attributes: { version: '42' } },
      ],
    };

    expect(highestBuild(page)).toBe(3592672);
  });

  it('skips a build string that is not a number', () => {
    expect(highestBuild({ data: [{ attributes: { version: '1.2.3' } }] })).toBeUndefined();
  });

  it('finds nothing in an app with no builds', () => {
    expect(highestBuild({ data: [] })).toBeUndefined();
  });

  it('refuses a body that is not a builds page', () => {
    expect(() => highestBuild({ errors: [] })).toThrow();
  });
});
