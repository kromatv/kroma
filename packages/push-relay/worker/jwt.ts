// Signing primitives for the push relay. Apple wants an ES256 assertion signed with a `.p8`
// auth key; Google wants an RS256 assertion traded at its token endpoint for an OAuth2 access
// token. Both are ordinary JWTs, so the shape lives here once and each transport supplies only
// its claims. Everything is WebCrypto: no dependencies, because a relay that holds the signing
// keys for an entire app's push traffic should have as little code running next to those keys
// as possible.

import { b64url, fromB64url } from '@kromatv/relay-grant';

const utf8 = new TextEncoder();

// The DER wrapper off a PEM block, whichever label it carries.
function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('empty PEM');
  return fromB64url(body.replaceAll('+', '-').replaceAll('/', '_'));
}

/**
 * Import an Apple `.p8` auth key.
 *
 * A `.p8` is a PKCS#8 P-256 private key. Apple never expires these, so the
 * import result is worth holding onto for the isolate's lifetime; see the
 * caches in `apns.ts` / `fcm.ts`.
 */
export function importEs256(p8: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemBody(p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** Import a Google service account's RSA private key. */
export function importRs256(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemBody(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Sign `{header, claims}` into a compact JWT. */
export async function sign(
  key: CryptoKey,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const input = `${b64url(utf8.encode(JSON.stringify(header)))}.${b64url(
    utf8.encode(JSON.stringify(claims)),
  )}`;
  const algorithm =
    key.algorithm.name === 'ECDSA'
      ? ({ name: 'ECDSA', hash: 'SHA-256' } as const)
      : ({ name: 'RSASSA-PKCS1-v1_5' } as const);
  const signature = await crypto.subtle.sign(algorithm, key, utf8.encode(input));
  return `${input}.${b64url(signature)}`;
}
