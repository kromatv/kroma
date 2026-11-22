const LIFETIME_S = 600;

/** An App Store Connect API key, as the `release` environment holds it. */
export interface AscKey {
  keyId: string;
  issuerId: string;
  privateKey: string;
}

const base64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');

function pkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replaceAll(/-----[A-Z ]+-----/g, '').replaceAll(/\s+/g, '');
  return new Uint8Array(Buffer.from(body, 'base64'));
}

/** The ES256 bearer token App Store Connect asks for, valid ten minutes. */
export async function ascToken(key: AscKey, now = Date.now()): Promise<string> {
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(key.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: key.keyId, typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: key.issuerId, iat, exp: iat + LIFETIME_S, aud: 'appstoreconnect-v1' }),
  );
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signer,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** The key from `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY`, or null when one is unset. */
export function readAscKey(env: NodeJS.ProcessEnv = process.env): AscKey | null {
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_PRIVATE_KEY: privateKey } = env;
  if (!keyId || !issuerId || !privateKey) {
    return null;
  }
  return { keyId, issuerId, privateKey };
}
