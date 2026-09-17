/** base64url, no padding: the only encoding a JWT accepts. */
export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCodePoint(byte);
  const b64 = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
  let end = b64.length;
  while (end > 0 && b64[end - 1] === '=') end--;
  return b64.slice(0, end);
}

/** Returns a view over a plain `ArrayBuffer` rather than `ArrayBufferLike`: the
 * WebCrypto signatures want the narrower one. Throws on text that is not base64url. */
export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}
