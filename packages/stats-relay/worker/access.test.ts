import { beforeEach, describe, expect, it } from 'vitest';
import { type AccessConfig, configFrom, resetKeyCache, verify } from './access';

const TEAM = 'kroma.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const NOW = 1_800_000_000_000;

const config: AccessConfig = {
  teamDomain: TEAM,
  aud: AUD,
  emails: ['owner@kroma.tv'],
};

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function keypair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
}

async function jwks(pair: CryptoKeyPair, kid: string) {
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { n: string; e: string };
  return { keys: [{ kid, kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' }] };
}

async function sign(pair: CryptoKeyPair, kid: string, claims: Record<string, unknown>) {
  const header = b64url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })),
  );
  const body = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${b64url(signature)}`;
}

function serving(document: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(document), { status: ok ? 200 : 500 })) as unknown as typeof fetch;
}

function goodClaims(overrides: Record<string, unknown> = {}) {
  return {
    aud: [AUD],
    iss: `https://${TEAM}`,
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    email: 'owner@kroma.tv',
    ...overrides,
  };
}

describe('configFrom', () => {
  it('is configured only when all three settings are present', () => {
    expect(
      configFrom({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'Owner@Kroma.tv' }),
    ).toEqual({ teamDomain: TEAM, aud: AUD, emails: ['owner@kroma.tv'] });
    expect(configFrom({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })).toBeNull();
    expect(configFrom({ ACCESS_AUD: AUD, ADMIN_EMAILS: 'a@b.c' })).toBeNull();
    expect(configFrom({})).toBeNull();
  });

  it('treats an empty administrator list as nobody, never as everybody', () => {
    expect(
      configFrom({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: '  ,  ' }),
    ).toBeNull();
  });
});

describe('verify', () => {
  let pair: CryptoKeyPair;
  let certs: typeof fetch;

  beforeEach(async () => {
    resetKeyCache();
    pair = await keypair();
    certs = serving(await jwks(pair, 'kid-1'));
  });

  it('lets a named administrator through', async () => {
    const token = await sign(pair, 'kid-1', goodClaims());

    expect(await verify(token, config, NOW, certs)).toEqual({ ok: true, email: 'owner@kroma.tv' });
  });

  it('turns away a request carrying no assertion at all', async () => {
    const verdict = await verify(undefined, config, NOW, certs);

    expect(verdict).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion whose signature does not hold', async () => {
    const token = await sign(pair, 'kid-1', goodClaims());
    const forged = `${token.slice(0, -6)}AAAAAA`;

    expect(await verify(forged, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion signed by a key the team does not publish', async () => {
    const other = await keypair();
    const token = await sign(other, 'kid-1', goodClaims());

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion minted for another application', async () => {
    const token = await sign(pair, 'kid-1', goodClaims({ aud: ['b'.repeat(64)] }));

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion issued by another team', async () => {
    const token = await sign(
      pair,
      'kid-1',
      goodClaims({ iss: 'https://evil.cloudflareaccess.com' }),
    );

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion that has expired', async () => {
    const token = await sign(pair, 'kid-1', goodClaims({ exp: Math.floor(NOW / 1000) - 3600 }));

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away an assertion that is not valid yet', async () => {
    const token = await sign(pair, 'kid-1', goodClaims({ nbf: Math.floor(NOW / 1000) + 3600 }));

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
  });

  it('turns away a perfectly valid assertion for somebody who is not an administrator', async () => {
    const token = await sign(pair, 'kid-1', goodClaims({ email: 'someone@else.example' }));

    expect(await verify(token, config, NOW, certs)).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses rather than admits when the identity provider cannot be reached', async () => {
    const token = await sign(pair, 'kid-1', goodClaims());

    const verdict = await verify(token, config, NOW, serving({}, false));

    expect(verdict).toMatchObject({ ok: false, status: 503 });
  });

  it('refuses an assertion that is not three parts of JSON', async () => {
    expect(await verify('not.a.jwt', config, NOW, certs)).toMatchObject({ ok: false, status: 401 });
    expect(await verify('onlyonepart', config, NOW, certs)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe('a malformed assertion', () => {
  let pair: CryptoKeyPair;
  let certs: typeof fetch;

  beforeEach(async () => {
    resetKeyCache();
    pair = await keypair();
    certs = serving(await jwks(pair, 'kid-1'));
  });

  it('is refused rather than thrown on, whatever the signature contains', async () => {
    const token = await sign(pair, 'kid-1', goodClaims());
    const [header, claims] = token.split('.');

    for (const signature of ['!', 'a', 'abc*', 'abcde', '', '💥']) {
      const verdict = await verify(`${header}.${claims}.${signature}`, config, NOW, certs);
      expect(verdict, signature).toMatchObject({ ok: false, status: 401 });
    }
  });

  it('is refused when the identity provider answers 200 with something that is not JSON', async () => {
    const token = await sign(pair, 'kid-1', goodClaims());
    const notJson = (async () => new Response('<html>nope</html>')) as unknown as typeof fetch;

    expect(await verify(token, config, NOW, notJson)).toMatchObject({ ok: false, status: 503 });
  });
});
