import { z } from 'zod';

export interface AscKey {
  keyId: string;
  issuerId: string;
  signingKey: CryptoKey;
}

const API = 'https://api.appstoreconnect.apple.com/v1';
const RECENT_BUILDS = 50;

const Builds = z.object({
  data: z.array(z.object({ attributes: z.object({ version: z.string() }) })),
});

const base64url = (bytes: ArrayBuffer | string) =>
  (typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes)).toString(
    'base64url',
  );

/** The signing key in an App Store Connect `.p8` file, armored or as its bare base64 body. */
export async function importP8(p8: string): Promise<CryptoKey> {
  const body = p8.replaceAll(/-----[A-Z ]+-----/g, '').replaceAll(/\s+/g, '');
  const der = Buffer.from(body, 'base64');
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** A ten-minute App Store Connect API token, signed ES256 with the team key. */
export async function ascToken(key: AscKey, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: key.keyId, typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: key.issuerId, iat, exp: iat + 600, aud: 'appstoreconnect-v1' }),
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.signingKey,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64url(signature)}`;
}

/** The highest numeric build in an App Store Connect `builds` page, or nothing when it lists none. */
export function highestBuild(body: unknown): number | undefined {
  const numbers = Builds.parse(body)
    .data.map((build) => Number(build.attributes.version))
    .filter(Number.isSafeInteger);
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

/** The highest build App Store Connect holds for an app, across its platforms, among its recent uploads. */
export async function latestBuild(appId: string, token: string): Promise<number | undefined> {
  const query = `filter[app]=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=${RECENT_BUILDS}&fields[builds]=version`;
  const res = await fetch(`${API}/builds?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`App Store Connect answered ${res.status} for the builds of app ${appId}`);
  return highestBuild(await res.json());
}
