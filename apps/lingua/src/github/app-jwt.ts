const RSA_ALGORITHM = [
  0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
];

function derLength(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) {
    bytes.unshift(n & 0xff);
  }
  return [0x80 | bytes.length, ...bytes];
}

function base64Bytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.codePointAt(0) ?? 0);
}

function pkcs8From(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const octet = [0x04, ...derLength(pkcs1.length)];
  const body = RSA_ALGORITHM.length + octet.length + pkcs1.length;
  return Uint8Array.from([0x30, ...derLength(body), ...RSA_ALGORITHM, ...octet, ...pkcs1]);
}

function pemBody(pem: string, label: string): string | null {
  const begin = `-----BEGIN ${label}-----`;
  const from = pem.indexOf(begin);
  const to = pem.indexOf(`-----END ${label}-----`);
  return from === -1 || to <= from ? null : pem.slice(from + begin.length, to);
}

/** The DER bytes of a private key GitHub issued, which is PKCS#1, or of one already converted to PKCS#8. */
export function privateKeyBytes(pem: string): Uint8Array<ArrayBuffer> {
  const pkcs8 = pemBody(pem, 'PRIVATE KEY');
  if (pkcs8) {
    return base64Bytes(pkcs8);
  }
  const pkcs1 = pemBody(pem, 'RSA PRIVATE KEY');
  if (pkcs1) {
    return pkcs8From(base64Bytes(pkcs1));
  }
  throw new Error('the GitHub App private key is not a PEM RSA key');
}

function base64Url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
}

/** The short-lived JWT a GitHub App signs to speak as itself, valid nine minutes from `now` (seconds). */
export async function appJwt(appId: string, pem: string, now: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}
