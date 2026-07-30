// Browser-side WebAuthn plumbing. The server speaks the webauthn-rs JSON shape
// (binary fields as base64url strings); the `navigator.credentials` API speaks
// ArrayBuffers. These helpers convert between the two and drive the two
// ceremonies, so the card/login code just deals with plain client calls.
//
// WebAuthn is only available in a secure context (HTTPS or localhost); callers
// must gate their UI on `passkeysSupported()` first.

import type { WebAuthnCredential, WebAuthnOptions } from '@kroma/core';
import { bytesToBase64Url } from '#web/shared/lib/base64url';

/** Whether the browser can run a WebAuthn ceremony here. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    window.PublicKeyCredential !== undefined &&
    !!navigator.credentials?.create
  );
}

/** base64url string → bytes. */
function decode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob((s + pad).replaceAll('-', '+').replaceAll('_', '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.codePointAt(i) ?? 0;
  return out;
}

/** Convert the server's `publicKey` options (base64url binary fields) into the
 * ArrayBuffer form `navigator.credentials` expects. Handles both the creation
 * (`user.id`, `excludeCredentials`) and request (`allowCredentials`) shapes. */
function toBufferOptions(
  publicKey: Record<string, unknown>,
): PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions {
  const pk: Record<string, unknown> = { ...publicKey };
  pk.challenge = decode(pk.challenge as string);
  if (pk.user) {
    const user = { ...(pk.user as Record<string, unknown>) };
    user.id = decode(user.id as string);
    pk.user = user;
  }
  const convert = (list: unknown) =>
    (list as { id: string }[] | undefined)?.map((c) => ({ ...c, id: decode(c.id) }));
  if (pk.excludeCredentials) pk.excludeCredentials = convert(pk.excludeCredentials);
  if (pk.allowCredentials) pk.allowCredentials = convert(pk.allowCredentials);
  return pk as unknown as PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions;
}

/** Run the registration ceremony → the credential JSON to send to `finish`. */
export async function createPasskey(options: WebAuthnOptions): Promise<WebAuthnCredential> {
  const publicKey = toBufferOptions(options.publicKey);
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey creation cancelled');
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bytesToBase64Url(res.attestationObject),
      clientDataJSON: bytesToBase64Url(res.clientDataJSON),
      transports: res.getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** Run the authentication ceremony → the assertion JSON to send to `finish`. */
export async function getPasskey(options: WebAuthnOptions): Promise<WebAuthnCredential> {
  const publicKey = toBufferOptions(options.publicKey);
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey request cancelled');
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bytesToBase64Url(res.authenticatorData),
      clientDataJSON: bytesToBase64Url(res.clientDataJSON),
      signature: bytesToBase64Url(res.signature),
      userHandle: res.userHandle ? bytesToBase64Url(res.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
