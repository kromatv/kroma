// base64url (RFC 4648 §5): the encoding the Push API's subscription keys and
// WebAuthn's credential fields both travel in.
//
// One copy on purpose: three separate ones drifted into three different ways of
// stripping the padding. Nothing is imported here, so the service worker can
// bundle it too.

/** Takes either form: WebAuthn and `PushSubscription.getKey` hand out raw
 * ArrayBuffers, while callers that already have a view pass it straight in. */
export function bytesToBase64Url(source: Uint8Array | ArrayBuffer): string {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  const b64 = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
  // btoa pads to a multiple of four, so the padding is at most `==` and only
  // ever trailing, which is what keeps this bounded rather than a backtracking
  // `=+$` (the same reasoning as stripTrailingSlash in the Synology generator).
  return b64.replace(/={1,2}$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  // Allocate the backing ArrayBuffer explicitly: `applicationServerKey` takes a
  // BufferSource over a plain ArrayBuffer, and a bare `new Uint8Array(n)` is
  // typed over the possibly-shared `ArrayBufferLike`.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}
